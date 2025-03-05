import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Meow',
    short_name: 'Meow',
    description: 'Meow meow meow',
    start_url: '/meow/bill',
    display: 'standalone',
    icons: [
      {
        src: '/poker/red_joker.svg',
        sizes: '192x192',
        type: 'image/svg',
        purpose: 'maskable',
      },
    ],
    theme_color: '#ffffff',
    background_color: '#003345',
  };
}
