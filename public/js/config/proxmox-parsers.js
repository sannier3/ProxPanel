/**
 * Parsers / serializers config Proxmox (alignés qemu-server / pve-container).
 */
(function (global) {
  const NET_PARAM_KEYS = new Set([
    'bridge', 'tag', 'firewall', 'rate', 'queues', 'trunks', 'link_down', 'mtu',
  ]);

  const LXC_NET_KEYS = new Set([
    'name', 'type', 'bridge', 'firewall', 'gw', 'gw6', 'hwaddr', 'ip', 'ip6',
    'link_down', 'mtu', 'rate', 'tag', 'trunks', 'host-managed',
  ]);

  const DISK_OPTION_KEYS = new Set([
    'cache', 'aio', 'iothread', 'discard', 'ssd', 'readonly', 'serial', 'backup',
    'replicate', 'mbps_rd', 'mbps_wr', 'iops_rd', 'iops_wr', 'detect_zeroes',
    'media', 'efitype', 'pre-enrolled-keys', 'import-from', 'snapshot',
  ]);

  const DISK_FLAG_KEYS = new Set(['iothread', 'discard', 'ssd', 'readonly', 'replicate']);

  function parsePropertyString(str, defaultKey) {
    const out = {};
    if (!str) return out;
    for (const p of String(str).split(',')) {
      const eq = p.indexOf('=');
      if (eq < 0) {
        if (defaultKey && !out[defaultKey]) out[defaultKey] = p.trim();
        continue;
      }
      out[p.slice(0, eq).trim()] = p.slice(eq + 1).trim();
    }
    return out;
  }

  function printPropertyString(obj, defaultKey) {
    const parts = [];
    for (const [k, v] of Object.entries(obj || {})) {
      if (v === '' || v == null || v === undefined) continue;
      if (defaultKey && k === defaultKey) parts.push(String(v));
      else parts.push(`${k}=${v}`);
    }
    return parts.join(',');
  }

  function emptyDiskOptions() {
    return {
      cache: '', aio: '', iothread: '0', discard: '0', ssd: '0', readonly: '0',
      serial: '', backup: '', replicate: '', mbps_rd: '', mbps_wr: '',
      iops_rd: '', iops_wr: '', detect_zeroes: '',
    };
  }

  function splitDiskOptionToken(token) {
    const eq = token.indexOf('=');
    if (eq < 0) {
      if (DISK_FLAG_KEYS.has(token)) return { key: token, value: '1' };
      return null;
    }
    const key = token.slice(0, eq).trim();
    let value = token.slice(eq + 1).trim();
    if (key === 'discard' && (value === 'on' || value === '1')) value = '1';
    if (DISK_OPTION_KEYS.has(key)) return { key, value };
    return null;
  }

  function applyDiskOptionsFromExtras(out) {
    const opts = emptyDiskOptions();
    const unknown = [];
    for (const e of out.extras || []) {
      const parsed = splitDiskOptionToken(e);
      if (parsed) opts[parsed.key] = parsed.value;
      else if (e) unknown.push(e);
    }
    Object.assign(out, opts);
    out.extras = unknown;
    return out;
  }

  function diskOptionsToExtras(o) {
    const extras = Array.isArray(o.extras) ? [...o.extras] : [];
    const add = (token) => {
      if (token && !extras.includes(token)) extras.push(token);
    };
    if (o.cache) add(`cache=${o.cache}`);
    if (o.aio) add(`aio=${o.aio}`);
    if (o.iothread === '1' || o.iothread === true) add('iothread=1');
    if (o.discard === '1' || o.discard === 'on') add('discard=on');
    if (o.ssd === '1' || o.ssd === true) add('ssd=1');
    if (o.readonly === '1' || o.readonly === true) add('readonly=1');
    if (o.serial) add(`serial=${o.serial}`);
    if (o.backup === '0') add('backup=0');
    if (o.replicate === '0') add('replicate=0');
    if (o.mbps_rd) add(`mbps_rd=${o.mbps_rd}`);
    if (o.mbps_wr) add(`mbps_wr=${o.mbps_wr}`);
    if (o.iops_rd) add(`iops_rd=${o.iops_rd}`);
    if (o.iops_wr) add(`iops_wr=${o.iops_wr}`);
    if (o.detect_zeroes === '1') add('detect_zeroes=1');
    return extras.filter(Boolean);
  }

  function parseNet(str) {
    const out = {
      model: 'virtio', mac: '', bridge: 'vmbr0', tag: '', firewall: '1', rate: '',
      queues: '', mtu: '', link_down: '0', trunks: '',
    };
    if (!str) return out;
    for (const p of String(str).split(',')) {
      const eq = p.indexOf('=');
      if (eq < 0) continue;
      const k = p.slice(0, eq).trim();
      const v = p.slice(eq + 1).trim();
      if (k === 'bridge') out.bridge = v;
      else if (k === 'tag') out.tag = v;
      else if (k === 'firewall') out.firewall = v;
      else if (k === 'rate') out.rate = v;
      else if (k === 'queues') out.queues = v;
      else if (k === 'mtu') out.mtu = v;
      else if (k === 'link_down') out.link_down = v;
      else if (k === 'trunks') out.trunks = v;
      else if (!NET_PARAM_KEYS.has(k)) {
        out.model = k;
        out.mac = v;
      }
    }
    return out;
  }

  function buildNet(o) {
    let s = `${o.model || 'virtio'}=${o.mac || 'auto'}`;
    if (o.bridge) s += `,bridge=${o.bridge}`;
    if (o.tag) s += `,tag=${o.tag}`;
    if (o.firewall && o.firewall !== '0') s += `,firewall=${o.firewall}`;
    if (o.rate) s += `,rate=${o.rate}`;
    if (o.queues) s += `,queues=${o.queues}`;
    if (o.mtu) s += `,mtu=${o.mtu}`;
    if (o.link_down === '1') s += ',link_down=1';
    if (o.trunks) s += `,trunks=${o.trunks}`;
    return s;
  }

  function parseLxcNet(str) {
    const p = parsePropertyString(str, 'name');
    return {
      name: p.name || 'eth0',
      type: p.type || 'veth',
      bridge: p.bridge || 'vmbr0',
      hwaddr: p.hwaddr || '',
      ip: p.ip || '',
      gw: p.gw || '',
      ip6: p.ip6 || '',
      gw6: p.gw6 || '',
      tag: p.tag || '',
      firewall: p.firewall ?? '1',
      rate: p.rate || '',
      mtu: p.mtu || '',
      link_down: p.link_down || '0',
      trunks: p.trunks || '',
      host_managed: p['host-managed'] || '',
    };
  }

  function buildLxcNet(o) {
    const parts = {};
    parts.name = o.name || 'eth0';
    if (o.type && o.type !== 'veth') parts.type = o.type;
    if (o.bridge) parts.bridge = o.bridge;
    if (o.hwaddr) parts.hwaddr = o.hwaddr;
    if (o.ip) parts.ip = o.ip;
    if (o.gw) parts.gw = o.gw;
    if (o.ip6) parts.ip6 = o.ip6;
    if (o.gw6) parts.gw6 = o.gw6;
    if (o.tag) parts.tag = o.tag;
    if (o.firewall === '0') parts.firewall = '0';
    if (o.rate) parts.rate = o.rate;
    if (o.mtu) parts.mtu = o.mtu;
    if (o.link_down === '1') parts.link_down = '1';
    if (o.trunks) parts.trunks = o.trunks;
    if (o.host_managed === '1') parts['host-managed'] = '1';
    return printPropertyString(parts, 'name');
  }

  function parseFeatures(str) {
    const p = parsePropertyString(str);
    return {
      nesting: p.nesting === '1',
      keyctl: p.keyctl === '1',
      fuse: p.fuse === '1',
      mknod: p.mknod === '1',
      force_rw_sys: p.force_rw_sys === '1',
      mount: p.mount || '',
    };
  }

  function buildFeatures(o) {
    const parts = {};
    if (o.nesting) parts.nesting = '1';
    if (o.keyctl) parts.keyctl = '1';
    if (o.fuse) parts.fuse = '1';
    if (o.mknod) parts.mknod = '1';
    if (o.force_rw_sys) parts.force_rw_sys = '1';
    if (o.mount) parts.mount = o.mount;
    return printPropertyString(parts);
  }

  function parseDisk(str) {
    const raw = String(str || '');
    const commaParts = raw.split(',');
    const main = commaParts[0] || '';
    const tail = commaParts.slice(1);
    const out = {
      storage: 'local-lvm',
      volid: '',
      size: '32',
      format: 'raw',
      isNew: true,
      extras: [],
      raw,
      ...emptyDiskOptions(),
    };
    const colon = main.indexOf(':');
    if (colon < 0) return out;

    out.storage = main.slice(0, colon);
    const volPart = main.slice(colon + 1);

    const fmt = tail.find((p) => p.startsWith('format=')) || raw.match(/(?:^|,)format=(\w+)/i)?.[0];
    if (fmt) out.format = fmt.replace(/^format=/i, '');

    const sizeTail = tail.find((p) => /^size=/i.test(p));
    const sizeInVol = volPart.match(/^size=(\d+)([GMK])?$/i);
    const plainSize = volPart.match(/^(\d+)([GMK])?$/i);

    if (sizeInVol || plainSize) {
      out.isNew = true;
      out.volid = '';
      out.size = (sizeInVol || plainSize)[1];
      out.extras = tail.filter((p) => !/^format=/i.test(p) && !/^size=/i.test(p));
    } else if (volPart) {
      out.isNew = false;
      out.volid = volPart;
      if (sizeTail) out.size = sizeTail.replace(/^size=/i, '').replace(/[GMK]$/i, '');
      else if (volPart.includes('size=')) {
        out.size = volPart.match(/size=(\d+)/i)?.[1] || out.size;
      }
      out.extras = tail.filter((p) => !/^format=/i.test(p) && !/^size=/i.test(p));
    }
    return applyDiskOptionsFromExtras(out);
  }

  function buildDisk(o) {
    const storage = o.storage || 'local-lvm';
    const format = o.format || 'raw';
    const size = o.size ? String(o.size).replace(/[GMK]$/i, '') : '32';
    const optExtras = diskOptionsToExtras(o);

    if (o.volid && o.isNew === false) {
      const main = `${storage}:${o.volid}`;
      const extras = optExtras.filter((e) => !/^format=/i.test(e) && !/^size=/i.test(e));
      if (format && format !== 'raw' && !extras.some((e) => e.startsWith('format='))) {
        extras.push(`format=${format}`);
      }
      if (size && !extras.some((e) => e.startsWith('size='))) {
        extras.push(`size=${size}G`);
      }
      const uniq = [...new Set(extras.filter(Boolean))];
      return uniq.length ? `${main},${uniq.join(',')}` : main;
    }

    let v = `${storage}:${size}G`;
    if (format && format !== 'raw') v += `,format=${format}`;
    for (const e of optExtras) {
      if (e && !v.includes(e.split('=')[0])) v += `,${e}`;
    }
    return v;
  }

  function diskIsCdrom(str) {
    const s = String(str || '');
    return s.includes('iso/') || /media=cdrom/i.test(s);
  }

  function isUnusedDiskKey(key) {
    return /^unused\d+$/i.test(String(key || ''));
  }

  function parseIsoValue(str) {
    const sv = String(str || '');
    const m = sv.match(/^([^:]+):iso\/([^,]+)(.*)$/);
    if (!m) return { storage: '', file: '', extras: ',media=cdrom' };
    let extras = m[3] || '';
    if (!extras.includes('media=cdrom')) extras = `${extras},media=cdrom`.replace(/^,/, ',');
    return { storage: m[1], file: m[2], extras: extras || ',media=cdrom' };
  }

  function buildIsoValue(storage, file, extras = ',media=cdrom') {
    if (!storage || !file) return '';
    let e = extras || ',media=cdrom';
    if (!e.startsWith(',')) e = `,${e}`;
    if (!e.includes('media=cdrom')) e += ',media=cdrom';
    return `${storage}:iso/${file}${e}`;
  }

  function parseStartup(str) {
    const s = String(str || '');
    const orderM = s.match(/(?:^|,)order=(\d+)/);
    const upM = s.match(/(?:^|,)up=(\d+)/);
    return { order: orderM ? orderM[1] : '', up: upM ? upM[1] : '' };
  }

  function buildStartup(order, up) {
    const o = String(order ?? '').trim();
    if (!o) return '';
    let v = `order=${o}`;
    const delay = String(up ?? '').trim();
    if (delay) v += `,up=${delay}`;
    return v;
  }

  function parseBootOrder(bootStr) {
    const s = String(bootStr || '');
    const orderMatch = s.match(/(?:^|,)order=([^;,]+(?:;[^;,]+)*)/i);
    if (orderMatch) {
      return orderMatch[1].split(';').map((x) => x.trim()).filter(Boolean);
    }
    return [];
  }

  function buildBootValue(order) {
    if (!order?.length) return '';
    return `order=${order.join(';')}`;
  }

  function parseVga(str) {
    const out = { type: '', memory: '', clipboard: '' };
    if (!str) return out;
    for (const p of String(str).split(',')) {
      const eq = p.indexOf('=');
      if (eq < 0) {
        if (!out.type) out.type = p.trim();
        continue;
      }
      const k = p.slice(0, eq).trim();
      const v = p.slice(eq + 1).trim();
      if (k === 'type') out.type = v;
      else if (k === 'memory') out.memory = v;
      else if (k === 'clipboard') out.clipboard = v;
    }
    return out;
  }

  function buildVga(o) {
    const parsed = { ...o };
    if (parsed.type === '' && !parsed.memory && !parsed.clipboard) return '';
    if (parsed.type === 'none' && !parsed.memory && !parsed.clipboard) return 'none';
    return printPropertyString(parsed, 'type');
  }

  function parseAgent(str) {
    if (!str || str === '0') return { enabled: false, freeze: false, fstrim: false };
    if (str === '1') return { enabled: true, freeze: false, fstrim: false };
    const p = parsePropertyString(str);
    return {
      enabled: p.enabled === '1' || p.enabled === 'true' || str === '1',
      freeze: p.freeze === '1',
      fstrim: p.fstrim_cloned_disks === '1',
    };
  }

  function buildAgent(o) {
    if (!o.enabled) return '0';
    const parts = { enabled: '1' };
    if (o.freeze) parts.freeze = '1';
    if (o.fstrim) parts.fstrim_cloned_disks = '1';
    const s = printPropertyString(parts);
    return s === '1' ? '1' : s.replace(/^enabled=1,?/, '1') || '1';
  }

  function parseMount(str) {
    const p = parsePropertyString(str);
    return {
      volume: p.volume || '',
      mp: p.mp || '',
      acl: p.acl || '',
      replicate: p.replicate || '',
      backup: p.backup || '',
      raw: str || '',
    };
  }

  function buildMount(o) {
    const parts = {};
    if (o.volume) parts.volume = o.volume;
    if (o.mp) parts.mp = o.mp;
    if (o.acl) parts.acl = o.acl;
    if (o.replicate === '0') parts.replicate = '0';
    if (o.backup === '0') parts.backup = '0';
    return printPropertyString(parts, 'volume') || o.raw || '';
  }

  function parseIpconfig(str) {
    return parsePropertyString(str);
  }

  function buildIpconfig(o) {
    return printPropertyString(o);
  }

  function isoSlotOptions() {
    const slots = [];
    for (let i = 0; i <= 3; i++) slots.push({ v: `ide${i}`, l: `IDE${i}` });
    for (let i = 0; i <= 5; i++) slots.push({ v: `sata${i}`, l: `SATA${i}` });
    for (let i = 0; i <= 30; i++) slots.push({ v: `scsi${i}`, l: `SCSI${i}` });
    return slots;
  }

  global.ProxPanelConfig = global.ProxPanelConfig || {};
  global.ProxPanelConfig.Parsers = {
    parsePropertyString,
    printPropertyString,
    parseNet,
    buildNet,
    parseLxcNet,
    buildLxcNet,
    parseFeatures,
    buildFeatures,
    parseDisk,
    buildDisk,
    diskIsCdrom,
    isUnusedDiskKey,
    parseIsoValue,
    buildIsoValue,
    parseStartup,
    buildStartup,
    parseBootOrder,
    buildBootValue,
    parseVga,
    buildVga,
    parseAgent,
    buildAgent,
    parseMount,
    buildMount,
    parseIpconfig,
    buildIpconfig,
    isoSlotOptions,
    LXC_NET_KEYS,
    DISK_OPTION_KEYS,
  };
})(typeof window !== 'undefined' ? window : globalThis);
