export function merge(target: any, source: any) {
  Object.keys(source).forEach(function (key) {
    if (["__proto__", "constructor", "prototype"].includes(key)) return;
    if (Array.isArray(source[key])) {
      target[key] = JSON.parse(JSON.stringify(source[key]));
      return;
    }
    if (
      source.hasOwnProperty(key) && // Check if the property is not inherited
      source[key] &&
      typeof source[key] === "object"
    ) {
      merge((target[key] = target[key] || {}), source[key]);
      return;
    }
    target[key] = source[key];
  });
}
