import * as React from 'react';

function findKey<T>(map: { [key: string]: T }, fn: (item: T) => boolean) {
  const keys = Object.keys(map);
  for (let i = 0; i < keys.length; i++) {
    if (fn(map[keys[i]])) {
      return keys[i];
    }
  }
}

function findIndex<T>(arr: T[], fn: (item: T) => boolean) {
  for (let i = 0; i < arr.length; i++) {
    if (fn(arr[i])) {
      return i;
    }
  }
  return -1;
}

function differenceBy<A, T>(
  arr1: A[],
  getKey1: (a: A) => React.Key,
  arr2: T[],
  getKey: (a: T) => React.Key,
) {
  const result: any[] = [];
  arr1.forEach(item1 => {
    const keyValue = getKey1(item1);
    if (!arr2.some(item2 => getKey(item2) === keyValue)) {
      result.push(item1);
    }
  });
  return result;
}

export { findKey, findIndex, differenceBy };
