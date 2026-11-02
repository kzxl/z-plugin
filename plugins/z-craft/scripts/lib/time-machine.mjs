/**
 * Vibe Time-Machine (Micro-Checkpoints)
 * Enables zero-risk creative exploration with 1-click shadow rollbacks.
 */

import fs from "node:fs";
import path from "node:path";

function getSnapshotsDir(cwd) {
  const dir = path.join(cwd, ".zero-craft", "snapshots");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function createCheckpoint(cwd, name = "checkpoint", filePaths = []) {
  const snapshotsDir = getSnapshotsDir(cwd);
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, "-");
  const cleanName = (name || "vibe").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40);
  const snapshotId = `${timestamp}_${cleanName}`;
  const snapshotFile = path.join(snapshotsDir, `${snapshotId}.json`);

  const filesData = [];
  for (const relPath of filePaths) {
    const fullPath = path.isAbsolute(relPath) ? relPath : path.join(cwd, relPath);
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
      filesData.push({
        path: path.relative(cwd, fullPath).replace(/\\/g, "/"),
        content: fs.readFileSync(fullPath, "utf8")
      });
    }
  }

  const payload = {
    id: snapshotId,
    name,
    createdAt: now.toISOString(),
    fileCount: filesData.length,
    files: filesData
  };

  fs.writeFileSync(snapshotFile, JSON.stringify(payload, null, 2), "utf8");

  return {
    success: true,
    snapshotId,
    name,
    fileCount: filesData.length,
    savedTo: snapshotFile
  };
}

export function listCheckpoints(cwd) {
  const snapshotsDir = getSnapshotsDir(cwd);
  const files = fs.readdirSync(snapshotsDir).filter(f => f.endsWith(".json"));
  const checkpoints = [];

  for (const f of files) {
    try {
      const content = JSON.parse(fs.readFileSync(path.join(snapshotsDir, f), "utf8"));
      checkpoints.push({
        id: content.id,
        name: content.name,
        createdAt: content.createdAt,
        fileCount: content.fileCount || (content.files ? content.files.length : 0)
      });
    } catch {
      // skip corrupted
    }
  }

  checkpoints.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return checkpoints;
}

export function restoreCheckpoint(cwd, idOrName) {
  const snapshotsDir = getSnapshotsDir(cwd);
  const checkpoints = listCheckpoints(cwd);

  const target = checkpoints.find(c => c.id === idOrName || c.name.toLowerCase() === idOrName.toLowerCase());
  if (!target) {
    return {
      success: false,
      message: `Checkpoint '${idOrName}' not found. Use list to inspect available checkpoints.`
    };
  }

  const snapshotFile = path.join(snapshotsDir, `${target.id}.json`);
  const data = JSON.parse(fs.readFileSync(snapshotFile, "utf8"));

  const restoredFiles = [];
  for (const item of data.files) {
    const targetPath = path.join(cwd, item.path);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, item.content, "utf8");
    restoredFiles.push(item.path);
  }

  return {
    success: true,
    snapshotId: target.id,
    name: target.name,
    restoredFiles,
    message: `Restored ${restoredFiles.length} file(s) from checkpoint '${target.name}'.`
  };
}
