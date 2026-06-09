export function getRuntimeHealth() {
  return {
    service: 'runtime-core',
    status: 'ok',
    checkedAt: new Date().toISOString()
  };
}
