/**
 * Unified Diff Parser for Z-Gate
 * Extracts modified files, added/deleted line counts, and class/interface declarations.
 */

export function parseDiff(diffText) {
  if (!diffText || typeof diffText !== 'string') {
    return {
      files: [],
      addedLines: [],
      deletedLines: [],
      interfaces: [],
      classes: [],
      locRatio: 0
    };
  }

  const files = new Set();
  const addedLines = [];
  const deletedLines = [];
  const interfaces = [];
  const classes = [];

  const lines = diffText.split(/\r?\n/);
  let currentFile = null;

  for (const line of lines) {
    // Detect file headers: +++ b/path/to/file or diff --git a/... b/...
    if (line.startsWith('+++ b/')) {
      currentFile = line.slice(6).trim();
      files.add(currentFile);
      continue;
    } else if (line.startsWith('diff --git a/')) {
      const parts = line.split(' ');
      if (parts[3] && parts[3].startsWith('b/')) {
        currentFile = parts[3].slice(2).trim();
        files.add(currentFile);
      }
      continue;
    }

    // Ignore hunk headers and meta
    if (line.startsWith('@@') || line.startsWith('---') || line.startsWith('index ')) {
      continue;
    }

    if (line.startsWith('+') && !line.startsWith('+++')) {
      const code = line.slice(1);
      addedLines.push({ file: currentFile, code });

      // Scan for new interface declarations: public interface IFoo
      const ifaceMatch = code.match(/\binterface\s+([I][a-zA-Z0-9_]+)\b/);
      if (ifaceMatch) {
        interfaces.push(ifaceMatch[1]);
      }

      // Scan for new class declarations: public class Foo : IFoo
      const classMatch = code.match(/\bclass\s+([a-zA-Z0-9_]+)\b/);
      if (classMatch) {
        classes.push(classMatch[1]);
      }
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      deletedLines.push({ file: currentFile, code: line.slice(1) });
    }
  }

  const addedCount = addedLines.length;
  const deletedCount = deletedLines.length;
  const locRatio = deletedCount > 0 ? (addedCount - deletedCount) / deletedCount : (addedCount > 0 ? 1 : 0);

  return {
    files: Array.from(files),
    addedLines,
    deletedLines,
    interfaces: Array.from(new Set(interfaces)),
    classes: Array.from(new Set(classes)),
    locRatio,
    netChange: addedCount - deletedCount
  };
}
