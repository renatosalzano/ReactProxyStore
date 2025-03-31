import { useState, useRef, useEffect } from "react";

type Fn = (...params: unknown[]) => unknown;

export function create<T extends object>(init: T) {

  type Getters = { [K in keyof T]: T[K] extends Fn ? never : T[K] };
  type Setters = { [K in keyof T]: Fn };

  if (!(init instanceof Object)) {
    // error
    console.error('must be object');
    init = {} as T;
  }

  const listeners: Record<keyof T, ((store: T) => void)[]> = {} as Record<keyof T, ((store: T) => void)[]>;

  const getters = {} as Getters;
  const setters = {} as Setters;

  const store = new Proxy(getters, {
    get(t, k) {
      return Reflect.get(t, k);
    },
    set(t, k, v) {

      Reflect.set(t, k, v);

      if (k in getters) getters[k as keyof Getters] = v;

      if (listeners[k as keyof T]) {
        listeners[k as keyof T].forEach((notify) => {
          notify(t as T);
        });
      }

      return true;
    }
  }) as T;

  for (const k in init) {
    if (typeof init[k] === 'function') {
      setters[k] = (...params: unknown[]) => (init[k] as Fn).apply(store, params);
    } else {
      getters[k] = (init as Getters)[k];
    }
  }

  const subscribe = <K extends keyof T>(key: K, fn: (store: T) => void) => {
    if (!listeners[key]) listeners[key] = [];
    const index = listeners[key].push(fn) - 1;

    return () => {
      listeners[key].splice(index, 1);
    };
  };

  function useStore(): T {
    const [state, setState] = useState<Partial<T>>(getters);

    const dependecies = new Set<keyof T>();

    const updateFn = (store: T) => {
      setState((prev) => ({ ...prev, ...store }));
    };

    const trap = useRef(new Proxy(state, {
      get(t, k) {
        if (!dependecies.has(k as keyof T)) {
          dependecies.add(k as keyof T);
        }
        return Reflect.get(t, k);
      }
    }));

    useEffect(() => {
      // subscribe
      const unsubs: (() => void)[] = [];

      for (const key of dependecies) {
        unsubs.push(subscribe(key, updateFn));
      }

      return () => {
        for (const unsubscribe of unsubs) {
          unsubscribe();
        }
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return { ...trap.current, ...setters } as T;
  }

  useStore.setState = (partial: Partial<Getters> | ((prevState: Readonly<Getters>) => Partial<Getters>)) => {
    const nextState = typeof partial === 'function'
      ? partial(getters)
      : partial;

    for (const k in nextState) {
      if (k in getters) {
        store[k as keyof T] = nextState[k] as T[keyof T];
      } else {
        console.warn(`Property "${k}" not exist`)
      }
    };
  };

  useStore.getState = <K extends keyof Getters>(key?: K): Getters[K] | Getters => {
    if (key && getters[key]) {
      return store[key] as Getters[K];
    }
    return getters;
  };

  return useStore as {
    (): T,
    setState: typeof useStore.setState,
    getState: typeof useStore.getState
  };
}