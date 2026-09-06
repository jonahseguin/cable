import { type ChannelHandler } from '@/common';

// Helper type for the parameters object expected by .for()
type ChannelParams = Record<string, string | number | boolean>;

// Result of a channel specification
export interface ChannelSpec {
  staticPath: string; // The static path segments (e.g., "user.profile")
  params: ChannelParams; // The parameters (e.g., { userId: "123" })
}

interface ProxyState {
  pathSegments: string[];
  params: ChannelParams;
  staticPath: string; // Keep this pre-calculated for efficiency
}

// No Node.js specific symbols needed for client-side code

const proxyHandler: ProxyHandler<ProxyState> = {
  // Trap for property access
  get(target: ProxyState, prop: string | symbol): unknown {
    // --- Specific Property Access for Inspection/Resolution ---
    // Return calculated values when these specific keys are accessed
    if (prop === 'staticPath') {
      return target.staticPath;
    }
    if (prop === 'params') {
      // Return a copy to prevent accidental modification of internal state
      return { ...target.params };
    }

    // --- Inspection / Primitive Conversion Symbols ---
    if (prop === Symbol.toPrimitive) {
      return (hint: 'string' | 'number' | 'default') => {
        if (hint === 'string' || hint === 'default') {
          return target.staticPath; // Use pre-calculated staticPath
        }
        return null;
      };
    }
    if (prop === Symbol.toStringTag) {
      return 'ChannelProxy';
    }

    // --- Allow other Symbol Access ---
    if (typeof prop === 'symbol') {
      return Reflect.get(target, prop);
    }

    // --- Special Methods (.for, .on) ---
    if (prop === 'for') {
      // Returns a function that expects parameters
      return (params: ChannelParams): unknown => {
        if (Object.keys(params).length === 0) {
          throw new Error(`.for() expects at least one parameter. Received empty object.`);
        }
        // Create a *new* proxy state with the parameters merged
        const newState: ProxyState = {
          pathSegments: target.pathSegments, // Keep original segments
          params: { ...target.params, ...params },
          staticPath: target.staticPath, // Static path doesn't change when adding params
        };
        // Return a new proxy reflecting the added parameters
        return new Proxy(newState, proxyHandler);
      };
    }
    if (prop === 'on') {
      // Return a function that resolves to the final ChannelSpec object
      return function onFunction<T>(_handler?: ChannelHandler<T>): ChannelSpec {
        return {
          staticPath: target.staticPath,
          params: { ...target.params },
        };
      };
    }

    // --- Ignore specific properties ---
    if (prop === 'config') {
      return undefined;
    }
    // Prevent access to internal state properties via the proxy itself
    if (prop === 'pathSegments') {
      return undefined;
    }
    // Special properties used by inspection tools that we don't want to proxy
    if (
      prop === 'then' ||
      prop === 'catch' ||
      prop === 'finally' || // Promise methods
      prop === '$$typeof' ||
      prop === 'constructor' || // React/framework internals
      prop === 'asymmetricMatch' // Jest/Vitest matcher internals
    ) {
      return undefined;
    }

    // --- Dynamic Path Building ---
    // If it's none of the above, treat it as a static path segment.
    const newPathSegments = [...target.pathSegments, prop];
    const newState: ProxyState = {
      pathSegments: newPathSegments,
      params: { ...target.params }, // Params are separate
      staticPath: newPathSegments.join('.'), // Update static path
    };
    // Return a new proxy for the extended path
    return new Proxy(newState, proxyHandler);
  },

  // Trap for key enumeration (e.g., Object.keys, for...in, toEqual)
  ownKeys(target: ProxyState): ArrayLike<string | symbol> {
    // Report only the keys that make it look like a ChannelSpec
    return ['staticPath', 'params'];
  },

  // Trap to ensure reported keys are configurable/enumerable
  getOwnPropertyDescriptor(
    target: ProxyState,
    prop: string | symbol,
  ): PropertyDescriptor | undefined {
    if (prop === 'staticPath') {
      return {
        value: target.staticPath, // Access target directly
        writable: true, // Match standard object property
        enumerable: true,
        configurable: true,
      };
    }
    if (prop === 'params') {
      return {
        value: { ...target.params }, // Access target directly (copy for safety)
        writable: true, // Match standard object property
        enumerable: true,
        configurable: true,
      };
    }
    // Let other properties be handled by the default reflection
    return Reflect.getOwnPropertyDescriptor(target, prop);
  },
};

export function createChannelProxy<TChannels>(): TChannels {
  const initialState: ProxyState = {
    pathSegments: [],
    params: {},
    staticPath: '', // Initial static path is empty
  };

  return new Proxy(initialState, proxyHandler) as TChannels;
}
