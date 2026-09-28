import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import type { KskConfigData } from './src/firebase';
import {
  buildKskScript,
  decodeKskConfigToken,
  KSK_JS_UPDATED_DATE,
  SERVER_DEFAULT_KSK_CONFIG,
} from './src/utils/kskScriptBuilder';
import { obfuscateScript } from './src/utils/obfuscate';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CACHE_FILE_PATH = '/tmp/his-ksk-api-cache.json';

interface KskApiCacheState {
  activeConfigId: string;
  activeKskConfig: KskConfigData;
  configsById: Record<string, KskConfigData>;
  totalRequests: number;
  lastRequestedAt: string | null;
}

const DEFAULT_PRESETS_BY_ID: Record<string, KskConfigData> = {
  preset_tt32_standard: {
    ...SERVER_DEFAULT_KSK_CONFIG,
    presetName: 'Khám sức khỏe toàn dân',
  },
  preset_driver_license: {
    ...SERVER_DEFAULT_KSK_CONFIG,
    chieuCaoMin: 162,
    chieuCaoMax: 175,
    canNangMin: 52,
    canNangMax: 72,
    ketLuanTinhTrang: 'Đủ điều kiện sức khỏe lái xe cơ giới theo quy định hiện hành.',
    presetName: 'Khám Sức Khỏe Lái Xe (Hạng B2/C/D/E)',
  },
  preset_periodic_corporate: {
    ...SERVER_DEFAULT_KSK_CONFIG,
    ketLuanTinhTrang:
      'Hiện tại chưa phát hiện bệnh lý nghề nghiệp hoặc bất thường. Sức khỏe Loại I.',
    presetName: 'Khám Sức Khỏe Định Kỳ Doanh Nghiệp',
  },
  preset_student_admission: {
    ...SERVER_DEFAULT_KSK_CONFIG,
    chieuCaoMin: 155,
    chieuCaoMax: 172,
    canNangMin: 46,
    canNangMax: 68,
    ketLuanTinhTrang: 'Đủ sức khỏe học tập và rèn luyện tại cơ sở đào tạo.',
    presetName: 'Khám Sức Khỏe Nhập Học Học Sinh / Sinh Viên',
  },
};

function loadInitialState(): KskApiCacheState {
  try {
    if (fs.existsSync(CACHE_FILE_PATH)) {
      const raw = fs.readFileSync(CACHE_FILE_PATH, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<KskApiCacheState>;
      return {
        activeConfigId: parsed.activeConfigId || 'preset_tt32_standard',
        activeKskConfig: {
          ...SERVER_DEFAULT_KSK_CONFIG,
          ...(parsed.activeKskConfig || {}),
        },
        configsById: {
          ...DEFAULT_PRESETS_BY_ID,
          ...(parsed.configsById || {}),
        },
        totalRequests: Number(parsed.totalRequests) || 0,
        lastRequestedAt: parsed.lastRequestedAt || null,
      };
    }
  } catch {
    // Ignore cache read error
  }
  return {
    activeConfigId: 'preset_tt32_standard',
    activeKskConfig: { ...SERVER_DEFAULT_KSK_CONFIG },
    configsById: { ...DEFAULT_PRESETS_BY_ID },
    totalRequests: 0,
    lastRequestedAt: null,
  };
}

const kskStore: KskApiCacheState = loadInitialState();

function persistState() {
  try {
    fs.writeFileSync(CACHE_FILE_PATH, JSON.stringify(kskStore, null, 2), 'utf-8');
  } catch {
    // Ignore write error in restricted environments
  }
}

function resolveKskConfigFromRequest(query: Record<string, any>): {
  configId: string;
  config: KskConfigData;
} {
  const configId = typeof query.configId === 'string' && query.configId.trim()
    ? query.configId.trim()
    : kskStore.activeConfigId;

  // 1. Start from server synced config for configId or activeKskConfig
  let resolved: KskConfigData = {
    ...SERVER_DEFAULT_KSK_CONFIG,
    ...(kskStore.configsById[configId] || kskStore.activeKskConfig || {}),
  };

  // 2. If compact token `c` is provided, merge token values
  if (typeof query.c === 'string' && query.c.trim()) {
    const decoded = decodeKskConfigToken(query.c.trim());
    if (decoded) {
      resolved = {
        ...resolved,
        ...decoded,
      };
      // However, if the server has a synced version of this configId, prefer the server's latest synced values
      // unless query.preferToken === '1'
      if (kskStore.configsById[configId] && query.preferToken === '0') {
        resolved = {
          ...resolved,
          ...kskStore.configsById[configId],
        };
      }
    }
  }

  // 3. Support direct query param overrides if passed
  if (query.chieuCaoMin !== undefined) resolved.chieuCaoMin = Number(query.chieuCaoMin) || resolved.chieuCaoMin;
  if (query.chieuCaoMax !== undefined) resolved.chieuCaoMax = Number(query.chieuCaoMax) || resolved.chieuCaoMax;
  if (query.canNangMin !== undefined) resolved.canNangMin = Number(query.canNangMin) || resolved.canNangMin;
  if (query.canNangMax !== undefined) resolved.canNangMax = Number(query.canNangMax) || resolved.canNangMax;
  if (typeof query.haCao === 'string' && query.haCao) resolved.haCao = query.haCao;
  if (typeof query.haThap === 'string' && query.haThap) resolved.haThap = query.haThap;
  if (typeof query.mach === 'string' && query.mach) resolved.mach = query.mach;
  if (typeof query.phanLoaiTheLuc === 'string' && query.phanLoaiTheLuc) {
    resolved.phanLoaiTheLuc = query.phanLoaiTheLuc;
  }
  if (typeof query.lamSang === 'string' && query.lamSang) resolved.lamSang = query.lamSang;
  if (typeof query.ketLuanTinhTrang === 'string' && query.ketLuanTinhTrang) {
    resolved.ketLuanTinhTrang = query.ketLuanTinhTrang;
  }
  if (typeof query.phanLoaiKetLuan === 'string' && query.phanLoaiKetLuan) {
    resolved.phanLoaiKetLuan = query.phanLoaiKetLuan;
  }
  if (query.maxCases !== undefined) resolved.maxCases = Number(query.maxCases) || resolved.maxCases;

  return { configId, config: resolved };
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '1mb' }));

  // Permissive CORS for all /api/* endpoints so external HIS domains can GET the KSK script from F12 Console
  app.use('/api', (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, Accept, X-Requested-With'
    );
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Timing-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  // 1. API Status Endpoint
  app.get('/api/ksk/status', (_req, res) => {
    res.json({
      ok: true,
      service: 'HIS Clinical KSK Script API',
      version: '4.2',
      updatedDate: KSK_JS_UPDATED_DATE,
      activeConfigId: kskStore.activeConfigId,
      activeConfigName:
        kskStore.activeKskConfig.presetName || 'Khám sức khỏe toàn dân',
      totalRequests: kskStore.totalRequests,
      lastRequestedAt: kskStore.lastRequestedAt,
    });
  });

  // 2. Sync Active Configuration from Webapp UI to API Server
  app.post('/api/ksk/sync', (req, res) => {
    try {
      const { activeConfigId, activeKskConfig, configs } = req.body || {};
      if (typeof activeConfigId === 'string' && activeConfigId) {
        kskStore.activeConfigId = activeConfigId;
      }
      if (activeKskConfig && typeof activeKskConfig === 'object') {
        kskStore.activeKskConfig = {
          ...SERVER_DEFAULT_KSK_CONFIG,
          ...activeKskConfig,
        };
        if (kskStore.activeConfigId) {
          kskStore.configsById[kskStore.activeConfigId] = kskStore.activeKskConfig;
        }
      }
      if (Array.isArray(configs)) {
        for (const item of configs) {
          if (item && typeof item.id === 'string' && item.kskConfig) {
            kskStore.configsById[item.id] = {
              ...SERVER_DEFAULT_KSK_CONFIG,
              ...item.kskConfig,
              presetName: item.name || item.kskConfig.presetName || 'Khám sức khỏe toàn dân',
            };
          }
        }
      }
      persistState();
      res.json({
        ok: true,
        activeConfigId: kskStore.activeConfigId,
        activeConfigName: kskStore.activeKskConfig.presetName,
      });
    } catch (err: any) {
      res.status(400).json({
        ok: false,
        error: err?.message || 'Invalid sync payload',
      });
    }
  });

  // 3. GET KSK Script API (supports both JSON response and direct JS execution via ?format=js or /api/ksk/script.js)
  const handleGetKskScript = (req: express.Request, res: express.Response) => {
    const { configId, config } = resolveKskConfigFromRequest(req.query as Record<string, any>);
    const isRawRequested = req.query.raw === '1' || req.query.raw === 'true';
    const isJsFormat =
      req.path.endsWith('.js') ||
      req.query.format === 'js' ||
      req.query.format === 'javascript';

    const rawScript = buildKskScript(config);
    const finalScript = isRawRequested
      ? rawScript
      : obfuscateScript(
          rawScript,
          `HIS CLINICAL ENGINE v4.2 (${config.presetName || 'TT32'}) - JS UPDATED: ${KSK_JS_UPDATED_DATE}`
        );

    kskStore.totalRequests += 1;
    kskStore.lastRequestedAt = new Date().toISOString();
    persistState();

    if (isJsFormat) {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      res.send(finalScript);
      return;
    }

    res.json({
      ok: true,
      version: '4.2',
      updatedDate: KSK_JS_UPDATED_DATE,
      configId,
      configName: config.presetName || 'Khám sức khỏe toàn dân',
      config,
      script: finalScript,
      totalRequests: kskStore.totalRequests,
    });
  };

  app.get('/api/ksk/script', handleGetKskScript);
  app.get('/api/ksk/script.js', handleGetKskScript);

  // Vite middleware in development, static assets in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[HIS-API Server] Running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
