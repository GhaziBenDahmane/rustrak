/**
 * Whether GitHub certainly cannot deliver to this URL: loopback, private
 * ranges and `.local` names. Anything else may be reachable, so it is trusted.
 */
export function unreachableFromGitHub(url: string): boolean {
  const host = new URL(url).hostname;
  return (
    host === 'localhost' ||
    host === '[::1]' ||
    host.endsWith('.local') ||
    /^(127|10)\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  );
}
