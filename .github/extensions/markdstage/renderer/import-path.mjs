export function splitImportPath(path) {
  const value = String(path || "");
  const separator = Math.max(value.lastIndexOf("/"), value.lastIndexOf("\\"));
  if (separator < 0) {
    return { filename: value, parentPath: "" };
  }
  return {
    filename: value.slice(separator + 1),
    parentPath: value.slice(0, separator),
  };
}
