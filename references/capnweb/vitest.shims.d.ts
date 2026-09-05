// Copyright (c) 2025 Cloudflare, Inc.
// Licensed under the MIT license found in the LICENSE.txt file or at:
//     https://opensource.org/license/mit

declare module 'vitest' {
  export interface ProvidedContext {
    testServerHost: string
  }
}

// mark this file as a module so augmentation works correctly
export {}
