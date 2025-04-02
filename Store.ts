import { useState, useRef, useEffect, createElement, ComponentType } from "react";

type Fn = (...params: unknown[]) => unknown;

export function create<T extends object>(init: T) {

  type Getters = { [K in keyof T]: T[K] extends Fn ? never : T[K] };
  type Setters = { [K in keyof T]: Fn };

  if (!(init instanceof Object)) {
    // error
    console.error('must be object');
    init = {} as T;
  }

  const listeners = {} as Record<keyof T, ((store: Getters) => void)[]>;

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
          notify(t as Getters);
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

  const subscribe = <K extends keyof T>(key: K, fn: (store: Getters) => void) => {
    if (!listeners[key]) listeners[key] = [];
    const index = listeners[key].push(fn) - 1;

    return () => {
      listeners[key].splice(index, 1);
    };
  };

  function useStore(): T {

    const [state, setState] = useState<Partial<T>>(getters);

    const isMounted = useRef(false);
    const dependecies = useRef(new Set<keyof Getters>());

    const updateFn = (store: Getters) => {
      setState((prev) => ({ ...prev, ...store }));
    };

    const trap = useRef(new Proxy(state, {
      get(t, k) {
        if (!isMounted.current) {
          console.log("trigger get");
          if (!dependecies.current.has(k as keyof T)) {
            dependecies.current.add(k as keyof T);
          }
        }
        return Reflect.get(t, k);
      }
    })).current;

    useEffect(() => {

      isMounted.current = true;
      // subscribe
      const unsubs: (() => void)[] = [];

      for (const key of dependecies.current) {
        unsubs.push(subscribe(key, updateFn));
      }

      return () => {
        for (const unsubscribe of unsubs) {
          unsubscribe();
        }
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return Object.assign(trap, setters) as T;
  }

  function watch(keys: (keyof T)[], callback: (store: Getters) => void) {
    const unsubs: (() => void)[] = [];

    for (const k of keys) {
      unsubs.push(subscribe(k, callback))
    }

    return () => {
      for (const unsubscribe of unsubs) {
        unsubscribe();
      }
    }
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


  useStore.connect = <C>(
    Component: C,
    map?: (store: Readonly<T>) => Partial<T>
  ): ComponentType<Partial<T>> => {

    const storeProps = map ? map(store) : store;

    return (props: Partial<T>) => {

      const [state, update] = useState(getters);
      const updateFn = (store: Getters) => update((p) => ({ ...p, ...store }));

      useEffect(() => {
        const unwatch = watch(Object.keys(storeProps) as (keyof T)[], updateFn)
        return () => {
          unwatch()
        }
      })

      return createElement(Component as ComponentType, { ...props, ...state });
    }

  }

  return useStore as {
    (): T,
    setState: typeof useStore.setState,
    getState: typeof useStore.getState,
    connect: typeof useStore.connect
  };
}
