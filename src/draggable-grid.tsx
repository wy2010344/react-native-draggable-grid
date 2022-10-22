import * as React from 'react';
import { useState, useEffect } from 'react';
import {
  PanResponder,
  Animated,
  StyleSheet,
  StyleProp,
  GestureResponderEvent,
  PanResponderGestureState,
  ViewStyle,
  LayoutChangeEvent,
} from 'react-native';
import { Block } from './block';
import { findKey, findIndex, differenceBy } from './utils';

export interface IOnLayoutEvent {
  nativeEvent: { layout: { x: number; y: number; width: number; height: number } };
}

/**
 * 参考来源 react-native-draggable-grid
 */
// interface IBaseItemType {
//   key: string | number
//   disabledDrag?: boolean
//   disabledReSorted?: boolean
// }

export interface IDraggableGridProps<DataType> {
  getKey(v: DataType): React.Key;
  disabledDrag?(v: DataType): boolean;
  disabledReSorted?(v: DataType): boolean;
  numColumns: number;
  data: DataType[];
  renderItem: (
    item: DataType,
    order: number,
    args: {
      onPress(): void
      onLongPress(): void
      delayLongPress: number
    },
  ) => React.ReactElement<any>;
  style?: ViewStyle;
  itemHeight?: number;
  dragStartAnimation?: StyleProp<any>;
  onItemPress?: (item: DataType) => void;
  onDragStart?: (item: DataType) => void;
  onDragging?: (gestureState: PanResponderGestureState) => void;
  onDragRelease?: (newSortedData: DataType[]) => void;
  onResetSort?: (newSortedData: DataType[]) => void;
  delayLongPress?: number;
}
interface IMap<T> {
  [key: string]: T;
}
interface IPositionOffset {
  x: number;
  y: number;
}
interface IOrderMapItem {
  order: number;
}
interface IItem<DataType> {
  key: string | number;
  itemData: DataType;
  currentPosition: Animated.AnimatedValueXY;
}
/**
 * 是使用flex-flow来实现grid
 * 如果只需要单列呢?把元素宽设置成全宽就行
 * @param props 
 * @returns 
 */
export const DraggableGrid = function <DataType>(
  props: IDraggableGridProps<DataType>,
) {
  const blockPositions = React.useRef<IPositionOffset[]>([]).current
  const orderMap = React.useRef<IMap<IOrderMapItem>>({}).current;
  const itemMap = React.useRef<IMap<DataType>>({}).current;
  const items = React.useRef<IItem<DataType>[]>([]).current;
  const activeBlockOffset = React.useRef({ x: 0, y: 0 }).current


  const [blockHeight, setBlockHeight] = useState(0);
  const [blockWidth, setBlockWidth] = useState(0);
  const [gridHeight] = useState<Animated.Value>(() => new Animated.Value(0));
  const [hadInitBlockSize, setHadInitBlockSize] = useState(false);
  const [dragStartAnimatedValue] = useState(() => new Animated.Value(1));
  //设置容器的布局位置
  const [gridLayout, setGridLayout] = useState({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  });
  //当前拖拽的顺序
  const [activeItemIndex, setActiveItemIndex] = useState<undefined | number>();
  const [panResponderCapture, setPanResponderCapture] = useState(false);
  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onStartShouldSetPanResponderCapture: () => false,
    onMoveShouldSetPanResponder: () => panResponderCapture,
    onMoveShouldSetPanResponderCapture: () => panResponderCapture,
    onShouldBlockNativeResponder: () => false,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant(_, gestureState) {
      const activeItem = getActiveItem();
      if (!activeItem) return false;
      props.onDragStart && props.onDragStart(activeItem.itemData);
      const { x0, y0, moveX, moveY } = gestureState;
      const activeOrigin = blockPositions[orderMap[activeItem.key].order];
      const x = activeOrigin.x - x0;
      const y = activeOrigin.y - y0;
      activeItem.currentPosition.setOffset({
        x,
        y,
      });
      activeBlockOffset.x = x
      activeBlockOffset.y = y
      activeItem.currentPosition.setValue({
        x: moveX,
        y: moveY,
      });
    },
    onPanResponderMove(_, gestureState) {
      const activeItem = getActiveItem();
      if (!activeItem) return false;
      const { moveX, moveY } = gestureState;
      props.onDragging && props.onDragging(gestureState);

      const xChokeAmount = Math.max(
        0,
        activeBlockOffset.x + moveX - (gridLayout.width - blockWidth),
      );
      const xMinChokeAmount = Math.min(0, activeBlockOffset.x + moveX);

      const dragPosition = {
        x: moveX - xChokeAmount - xMinChokeAmount,
        y: moveY,
      };
      const originPosition = blockPositions[orderMap[activeItem.key].order];
      const dragPositionToActivePositionDistance = getDistance(
        dragPosition,
        originPosition,
      );
      activeItem.currentPosition.setValue(dragPosition);

      let closetItemIndex = activeItemIndex as number;
      let closetDistance = dragPositionToActivePositionDistance;

      items.forEach((item, index) => {
        if (props.disabledReSorted?.(item.itemData)) return;
        if (index != activeItemIndex) {
          const dragPositionToItemPositionDistance = getDistance(
            dragPosition,
            blockPositions[orderMap[item.key].order],
          );
          if (
            dragPositionToItemPositionDistance < closetDistance &&
            dragPositionToItemPositionDistance < blockWidth
          ) {
            closetItemIndex = index;
            closetDistance = dragPositionToItemPositionDistance;
          }
        }
      });
      if (activeItemIndex != closetItemIndex) {
        const closetOrder = orderMap[items[closetItemIndex].key].order;
        resetBlockPositionByOrder(orderMap[activeItem.key].order, closetOrder);
        orderMap[activeItem.key].order = closetOrder;
        props.onResetSort && props.onResetSort(getSortData());
      }
    },
    onPanResponderRelease() {
      const activeItem = getActiveItem();
      if (!activeItem) return false;
      props.onDragRelease && props.onDragRelease(getSortData());
      setPanResponderCapture(false);
      activeItem.currentPosition.flattenOffset();
      moveBlockToBlockOrderPosition(activeItem.key);
      setActiveItemIndex(undefined);
    },
  });
  function getBlockPositionByOrder(order: number) {
    if (blockPositions[order]) {
      return blockPositions[order];
    }
    const columnOnRow = order % props.numColumns;
    const y = blockHeight * Math.floor(order / props.numColumns);
    const x = columnOnRow * blockWidth;
    return {
      x,
      y,
    };
  }
  function resetBlockPositionByOrder(
    activeItemOrder: number,
    insertedPositionOrder: number,
  ) {
    let disabledReSortedItemCount = 0;
    if (activeItemOrder > insertedPositionOrder) {
      for (let i = activeItemOrder - 1; i >= insertedPositionOrder; i--) {
        const key = getKeyByOrder(i);
        const item = itemMap[key];
        if (item && props.disabledReSorted?.(item)) {
          disabledReSortedItemCount++;
        } else {
          orderMap[key].order += disabledReSortedItemCount + 1;
          disabledReSortedItemCount = 0;
          moveBlockToBlockOrderPosition(key);
        }
      }
    } else {
      for (let i = activeItemOrder + 1; i <= insertedPositionOrder; i++) {
        const key = getKeyByOrder(i);
        const item = itemMap[key];
        if (item && props.disabledReSorted?.(item)) {
          disabledReSortedItemCount++;
        } else {
          orderMap[key].order -= disabledReSortedItemCount + 1;
          disabledReSortedItemCount = 0;
          moveBlockToBlockOrderPosition(key);
        }
      }
    }
  }
  function moveBlockToBlockOrderPosition(itemKey: string | number) {
    const itemIndex = findIndex(items, item => `${item.key}` === `${itemKey}`);
    items[itemIndex].currentPosition.flattenOffset();
    Animated.timing(items[itemIndex].currentPosition, {
      toValue: blockPositions[orderMap[itemKey].order],
      duration: 200,
      useNativeDriver: false,
    }).start();
  }
  function getKeyByOrder(order: number) {
    return findKey(
      orderMap,
      (item: IOrderMapItem) => item.order === order,
    ) as string;
  }

  function getSortData() {
    const sortData: DataType[] = [];
    items.forEach(item => {
      sortData[orderMap[item.key].order] = item.itemData;
    });
    return sortData;
  }
  function getDistance(
    startOffset: IPositionOffset,
    endOffset: IPositionOffset,
  ) {
    const xDistance = startOffset.x + activeBlockOffset.x - endOffset.x;
    const yDistance = startOffset.y + activeBlockOffset.y - endOffset.y;
    return Math.sqrt(Math.pow(xDistance, 2) + Math.pow(yDistance, 2));
  }
  function startDragStartAnimation() {
    if (!props.dragStartAnimation) {
      dragStartAnimatedValue.setValue(1);
      Animated.timing(dragStartAnimatedValue, {
        toValue: 1.1,
        duration: 100,
        useNativeDriver: false,
      }).start();
    }
  }
  function getBlockStyle(itemIndex: number) {
    return [
      {
        justifyContent: 'center',
        alignItems: 'center',
      },
      hadInitBlockSize && {
        width: blockWidth,
        height: blockHeight,
        position: 'absolute',
        top: items[itemIndex].currentPosition.getLayout().top,
        left: items[itemIndex].currentPosition.getLayout().left,
      },
    ]
  }
  function getDragStartAnimation(itemIndex: number) {
    if (activeItemIndex != itemIndex) {
      return;
    }

    const dragStartAnimation =
      props.dragStartAnimation || getDefaultDragStartAnimation();
    return {
      zIndex: 3,
      ...dragStartAnimation,
    };
  }
  function getActiveItem() {
    if (activeItemIndex === undefined) return false;
    return items[activeItemIndex];
  }
  function getDefaultDragStartAnimation() {
    return {
      transform: [
        {
          scale: dragStartAnimatedValue,
        },
      ],
      shadowColor: '#000000',
      shadowOpacity: 0.2,
      shadowRadius: 6,
      shadowOffset: {
        width: 1,
        height: 1,
      },
    };
  }
  /**每次布局变化,调整内部变量*/
  useEffect(() => {
    startDragStartAnimation();
  }, [activeItemIndex]);

  useEffect(() => {
    if (hadInitBlockSize) {
      //初始化blockPositions
      items.forEach((_, index) => {
        blockPositions[index] = getBlockPositionByOrder(index);
      });
    }
  }, [gridLayout]);
  useEffect(() => {
    //调整高度
    const rowCount = Math.ceil(props.data.length / props.numColumns);
    gridHeight.setValue(rowCount * blockHeight);
  });

  function addItem(item: DataType, index: number) {
    blockPositions.push(getBlockPositionByOrder(items.length));
    const itemKey = props.getKey(item);
    orderMap[itemKey] = {
      order: index,
    };
    itemMap[itemKey] = item;
    items.push({
      key: itemKey,
      itemData: item,
      currentPosition: new Animated.ValueXY(getBlockPositionByOrder(index)),
    });
  }
  function removeItem(item: IItem<DataType>) {
    const itemIndex = findIndex(items, curItem => curItem.key === item.key);
    items.splice(itemIndex, 1);
    blockPositions.pop();
    delete orderMap[item.key];
  }
  if (hadInitBlockSize) {
    //在布局确定之后,差异性处理内部顺序
    props.data.forEach((item, index) => {
      const itemKey = props.getKey(item);
      if (orderMap[itemKey]) {
        if (orderMap[itemKey].order != index) {
          orderMap[itemKey].order = index;
          moveBlockToBlockOrderPosition(itemKey);
        }
        const currentItem = items.find(i => i.key === itemKey);
        if (currentItem) {
          currentItem.itemData = item;
        }
        itemMap[itemKey] = item;
      } else {
        addItem(item, index);
      }
    });
    const deleteItems = differenceBy(
      items,
      v => v.key,
      props.data,
      props.getKey,
    );
    deleteItems.forEach(item => {
      removeItem(item);
    });
  }


  const itemList = items.map((item, itemIndex) => {
    const args = {
      onPress() {
        props.onItemPress && props.onItemPress(items[itemIndex].itemData);
      },
      onLongPress() {
        if (props.disabledDrag?.(item.itemData)) return;
        setPanResponderCapture(true);
        setActiveItemIndex(itemIndex);
      },
      delayLongPress: props.delayLongPress || 300,
    };
    return (
      <Block
        {...args}
        panHandlers={panResponder.panHandlers}
        style={getBlockStyle(itemIndex)}
        dragStartAnimationStyle={getDragStartAnimation(itemIndex)}
        key={item.key}>
        {props.renderItem(item.itemData, orderMap[item.key].order, args)}
      </Block>
    );
  });
  return (
    <Animated.View
      style={[
        styles.draggableGrid,
        props.style,
        {
          height: gridHeight,
        },
      ]}
      onLayout={(event: LayoutChangeEvent) => {
        if (!hadInitBlockSize) {
          let blockWidth = event.nativeEvent.layout.width / props.numColumns;
          let blockHeight = props.itemHeight || blockWidth;
          setBlockWidth(blockWidth);
          setBlockHeight(blockHeight);
          setGridLayout(event.nativeEvent.layout);
          setHadInitBlockSize(true);
        }
      }}>
      {hadInitBlockSize && itemList}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  draggableGrid: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
});
