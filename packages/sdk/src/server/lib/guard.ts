'use server';

if (typeof window !== 'undefined') {
  console.log('Current file:', import.meta.url);
  throw new Error('sock8 server-side SDK cannot be used in the browser!');
}
