import { Router } from 'express';
import express from 'express';
import multer from 'multer';
import { requireAuth, getProxmoxContext } from '../middleware/require-auth.js';
import { config } from '../config.js';
import {
  fetchFileExplorerTree,
  fetchFileExplorerList,
} from '../handlers/file-explorer-handler.js';
import {
  readFileOnNode,
  writeFileOnNode,
  mkdirOnNode,
  removeOnNode,
  moveOnNode,
  normalizeFsPath,
  joinPath,
  canModifyFilesystem,
  MAX_UPLOAD_BYTES,
} from '../lib/node-fs-ops.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.fileExplorer.maxUploadBytes },
});

router.get('/tree', requireAuth, async (req, res) => {
  try {
    const ctx = getProxmoxContext(req);
    const data = await fetchFileExplorerTree(ctx);
    res.json({ ok: true, ...data, canModify: canModifyFilesystem() });
  } catch (err) {
    console.error('GET /api/file-explorer/tree:', err);
    res.status(500).json({ ok: false, error: 'Erreur serveur' });
  }
});

router.get('/list', requireAuth, async (req, res) => {
  try {
    const ctx = getProxmoxContext(req);
    const node = req.query.node ?? '';
    const dirPath = req.query.path ?? '/';
    const data = await fetchFileExplorerList(ctx, node, dirPath);
    res.json({ ok: !data.error, canModify: canModifyFilesystem(), ...data });
  } catch (err) {
    console.error('GET /api/file-explorer/list:', err);
    res.status(500).json({ ok: false, error: 'Erreur serveur' });
  }
});

router.get('/read', requireAuth, async (req, res) => {
  try {
    const ctx = getProxmoxContext(req);
    const node = req.query.node ?? '';
    const filePath = req.query.path ?? '';
    if (!config.prod) {
      return res.json({
        ok: true,
        path: filePath,
        text: `# Fichier démo\n\nContenu simulé pour ${filePath}\n`,
        size: 32,
      });
    }
    const data = await readFileOnNode(ctx, node, filePath);
    if (!data.ok) return res.status(400).json(data);
    res.json(data);
  } catch (err) {
    console.error('GET /api/file-explorer/read:', err);
    res.status(500).json({ ok: false, error: 'Erreur lecture' });
  }
});

router.get('/download', requireAuth, async (req, res) => {
  try {
    const ctx = getProxmoxContext(req);
    const node = req.query.node ?? '';
    const filePath = req.query.path ?? '';
    const data = await readFileOnNode(ctx, node, filePath);
    if (!data.ok) return res.status(400).json(data);
    const buf = Buffer.from(data.content || '', 'base64');
    const name = filePath.split('/').pop() || 'download';
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(name)}"`);
    res.send(buf);
  } catch (err) {
    console.error('GET /api/file-explorer/download:', err);
    res.status(500).json({ ok: false, error: 'Erreur téléchargement' });
  }
});

router.post('/write', requireAuth, express.json({ limit: `${config.fileExplorer.maxUploadBytes}b` }), async (req, res) => {
  try {
    const ctx = getProxmoxContext(req);
    const { node, path: filePath, content, encoding } = req.body ?? {};
    if (!node || !filePath) return res.status(400).json({ ok: false, error: 'Paramètres manquants' });
    let payload = content ?? '';
    if (encoding === 'base64') {
      const data = await writeFileOnNode(ctx, node, filePath, payload, false);
      return res.json(data);
    }
    const data = await writeFileOnNode(ctx, node, filePath, payload, true);
    res.json(data);
  } catch (err) {
    console.error('POST /api/file-explorer/write:', err);
    res.status(500).json({ ok: false, error: 'Erreur enregistrement' });
  }
});

router.post('/upload', requireAuth, upload.single('file'), async (req, res) => {
  try {
    const ctx = getProxmoxContext(req);
    const node = req.body?.node ?? req.query?.node ?? '';
    const dirPath = req.body?.path ?? req.query?.path ?? '/';
    const file = req.file;
    if (!node || !file) {
      return res.status(400).json({ ok: false, error: 'Fichier ou nœud manquant' });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return res.status(400).json({ ok: false, error: 'file_too_large' });
    }
    const dest = joinPath(dirPath, file.originalname || 'upload.bin');
    if (!dest) return res.status(400).json({ ok: false, error: 'invalid_path' });
    const b64 = file.buffer.toString('base64');
    const data = await writeFileOnNode(ctx, node, dest, b64, false);
    res.json({ ...data, path: dest, name: file.originalname });
  } catch (err) {
    console.error('POST /api/file-explorer/upload:', err);
    res.status(500).json({ ok: false, error: 'Erreur upload' });
  }
});

router.post('/mkdir', requireAuth, express.json(), async (req, res) => {
  try {
    const ctx = getProxmoxContext(req);
    const { node, path: dirPath } = req.body ?? {};
    const data = await mkdirOnNode(ctx, node, dirPath);
    res.json(data);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/delete', requireAuth, express.json(), async (req, res) => {
  try {
    const ctx = getProxmoxContext(req);
    const { node, path: targetPath, recursive } = req.body ?? {};
    const data = await removeOnNode(ctx, node, targetPath, !!recursive);
    res.json(data);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/move', requireAuth, express.json(), async (req, res) => {
  try {
    const ctx = getProxmoxContext(req);
    const { node, from, to } = req.body ?? {};
    const data = await moveOnNode(ctx, node, from, to);
    res.json(data);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
