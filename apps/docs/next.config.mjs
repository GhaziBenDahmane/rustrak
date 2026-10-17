import nextra from 'nextra';

const withNextra = nextra({
  contentDirBasePath: '/',
  defaultShowCopyCode: true,
});

// Served from the root of rustrak.dev, so there is no base path. The
// NEXT_PUBLIC_BASE_PATH readers fall back to '' and keep working if one ever
// comes back.
export default withNextra({
  output: 'export',
  images: { unoptimized: true },
});
