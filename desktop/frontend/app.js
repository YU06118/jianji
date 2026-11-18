/* 简记 · 桌面端前端逻辑
 * 运行在 Tauri WebView 中：数据走 Rust 命令 → 本机 SQLite（Q20）
 * 独立浏览器打开时：自动降级到 localStorage，便于无 Rust 环境预览
 * 金额口径与 shared/core.js 一致：内部用「分」整数运算
 */
(function () {
  'use strict'
  const IN_TAURI = typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__
  const invoke = IN_TAURI
    ? (cmd, args) => window.__TAURI_INTERNALS__.invoke(cmd, args || {})
    : async () => { throw new Error('not tauri') }

  // ---------- 金额与工具 ----------
  const toCents = y => Math.round((Number(y) || 0) * 100)
  const toYuan = c => Math.round(c) / 100
  const sumYuan = list => toYuan(list.reduce((a, b) => a + toCents(b), 0))
  const money = n => '¥ ' + (Number(n) || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const uid = () => 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  const catColor = {}

  // ---------- 预设分类（与 SQLite 初始化一致）----------
  const PRESET_OUT = [
    ['food', '🍜', '餐饮', '#4f5bd5'], ['grocery', '🥬', '买菜', '#6FAE5F'], ['daily', '🧴', '日用', '#4FB3A5'],
    ['clothing', '👗', '服饰', '#E5759B'], ['home', '🏠', '居住', '#7c86ff'], ['transport', '🚇', '交通', '#34c759'],
    ['medical', '💊', '医疗', '#ff2d55'], ['fun', '🎬', '娱乐', '#AF52DE'], ['study', '📚', '学习', '#32ADE6'], ['other', '📦', '其他', '#A79DA2']
  ]
  const PRESET_IN = [
    ['salary', '💰', '工资', '#34C759'], ['bonus', '🎁', '奖金', '#FFCC00'], ['redpack', '🧧', '红包', '#D9736E'], ['other_in', '📥', '其他', '#A79DA2']
  ]
  let catsOut = PRESET_OUT.map(([id, e, n, c]) => ({ id, e, n, c })),
      catsIn = PRESET_IN.map(([id, e, n, c]) => ({ id, e, n, c }))
  PRESET_OUT.concat(PRESET_IN).forEach(([id, , , c]) => catColor[id] = c)

  // ---------- 数据层 ----------
  let txs = []          // UI 形态：{id,ic,bg,n,note,amt,out,t,ts,date,cat,image,deleted,_i}
  let pendingImage = null

  function fromRecord(r) {
    const d = new Date(r.ts || Date.now())
    const c = catColor[r.cat] || '#8e8e93'
    const cat = catsOut.concat(catsIn).find(x => x.id === r.cat)
    return {
      id: r.id, cat: r.cat, date: r.date, ts: r.ts, image: r.image || '', deleted: !!r.deleted,
      ic: cat ? cat.e : '📦', bg: c + '1f',
      n: r.note || (cat ? cat.n : '未分类'), note: r.note || '',
      amt: toYuan(r.amount), out: r.kind === 'expense',
      t: `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    }
  }
  function toRecord(x) {
    return {
      id: x.id || uid(), kind: x.out ? 'expense' : 'income', amount: toCents(x.amt),
      cat: x.cat || 'other', note: x.note || '', date: x.date || new Date().toISOString().slice(0, 10),
      ts: x.ts || Date.now(), image: x.image || '', deleted: x.deleted ? 1 : 0
    }
  }

  // localStorage 降级实现
  const LS = {
    get() { try { return JSON.parse(localStorage.getItem('jianji_records') || '[]') } catch (e) { return [] } },
    set(list) { localStorage.setItem('jianji_records', JSON.stringify(list)) }
  }

  async function loadRecords() {
    if (IN_TAURI) {
      const rows = await invoke('list_records', { includeDeleted: 1 })
      txs = rows.map(fromRecord)
    } else {
      let list = LS.get()
      if (!list.length) {
        // 演示数据（仅预览用，首次写入本地）
        list = [
          { id: uid(), kind: 'expense', amount: 3850, cat: 'food', note: '午餐 · 公司附近', date: '2026-11-17', ts: Date.now() - 3600000, image: '', deleted: 0 },
          { id: uid(), kind: 'expense', amount: 1200, cat: 'transport', note: '地铁通勤', date: '2026-11-17', ts: Date.now() - 7200000, image: '', deleted: 0 },
          { id: uid(), kind: 'income', amount: 1280000, cat: 'salary', note: '11月工资', date: '2026-11-15', ts: Date.now() - 86400000 * 2, image: '', deleted: 0 },
          { id: uid(), kind: 'expense', amount: 320000, cat: 'home', note: '房租', date: '2026-11-05', ts: Date.now() - 86400000 * 12, image: '', deleted: 0 }
        ]
        LS.set(list)
      }
      txs = list.map(fromRecord)
    }
    render()
  }
  async function saveRecord(rec) {
    if (IN_TAURI) await invoke('save_record', { record: toRecord(rec) })
    else {
      const list = LS.get(), idx = list.findIndex(r => r.id === rec.id)
      const row = toRecord(rec)
      if (idx >= 0) list[idx] = row; else list.unshift(row)
      LS.set(list)
    }
  }
  async function trashRecord(id, deleted) {
    if (IN_TAURI) await invoke('trash_record', { id, deleted })
    else {
      const list = LS.get().map(r => r.id === id ? Object.assign({}, r, { deleted }) : r)
      LS.set(list)
    }
    await loadRecords()
  }

  // ---------- 渲染 ----------
  function txRow(x, del) {
    return `<div class="tx"><div class="ic" style="background:${x.bg}">${x.ic}</div>
      <div class="meta"><b>${esc(x.n)}</b><span>${x.t} · ${esc(x.note)}</span></div>
      ${x.image ? '<div class="thumb" title="含小票图片">▧</div>' : ''}
      <div class="money ${x.out ? 'out' : 'in'}">${x.out ? '−' : '+'} ${money(x.amt)}</div>
      ${del ? `<button class="del" title="删除" data-id="${x.id}">✕</button>` : ''}</div>`
  }
  function groupByDate(list, del) {
    if (!list.length) return '<div style="padding:24px;text-align:center;color:var(--label3);font-size:13px">暂无记录</div>'
    const groups = {}
    list.forEach(x => { const k = x.date; (groups[k] = groups[k] || []).push(x) })
    return Object.keys(groups).sort().reverse().map(k =>
      `<div class="date-group"><div class="date-label"><span>${k}</span><span>${groups[k].length} 笔</span></div>${groups[k].map(x => txRow(x, del)).join('')}</div>`
    ).join('')
  }
  function render() {
    const live = txs.filter(x => !x.deleted)
    txs.forEach((x, i) => x._i = i)
    document.getElementById('recentList').innerHTML = groupByDate(live.slice(0, 5), false)
    document.getElementById('fullList').innerHTML = groupByDate(txs, true)
    document.getElementById('txCount').textContent = live.length
    // 绑定删除按钮
    document.querySelectorAll('#fullList .del').forEach(b => b.onclick = () => trashRecord(b.dataset.id, 1))
    // 汇总
    const inc = sumYuan(live.filter(x => !x.out).map(x => x.amt))
    const exp = sumYuan(live.filter(x => x.out).map(x => x.amt))
    const cards = document.querySelectorAll('#v-overview .card .v')
    if (cards[0]) cards[0].innerHTML = `<span class="cur">¥</span>${exp.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`
    if (cards[1]) cards[1].innerHTML = `<span class="cur">¥</span>${inc.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`
    if (cards[2]) cards[2].innerHTML = `<span class="cur">¥</span>${(inc - exp).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`
    // 支出分类环形图（真实数据）
    renderDonut(live.filter(x => x.out))
    // 近 12 个月收支趋势（真实数据）
    renderTrend(live)
  }

  function renderTrend(list) {
    const svg = document.querySelector('#v-overview .chart-svg')
    if (!svg) return
    const now = new Date()
    const months = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }
    const buckets = {}
    months.forEach(m => buckets[m] = { income: 0, expense: 0 })
    list.forEach(x => {
      const k = (x.date || '').slice(0, 7)
      if (buckets[k]) buckets[k][x.out ? 'expense' : 'income'] += toCents(x.amt)
    })
    const maxC = Math.max(1, ...months.map(m => Math.max(buckets[m].income, buckets[m].expense)))
    const pts = key => months.map((m, i) =>
      `${(i / 11 * 520).toFixed(1)},${(140 - buckets[m][key] / maxC * 110).toFixed(1)}`).join(' ')
    const incPts = pts('income'), expPts = pts('expense')
    svg.innerHTML = `
      <defs><linearGradient id="gi" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2f9e6b" stop-opacity=".22"/><stop offset="1" stop-color="#2f9e6b" stop-opacity="0"/></linearGradient></defs>
      <g stroke="var(--sep)" stroke-width="1"><line x1="0" y1="38" x2="520" y2="38"/><line x1="0" y1="80" x2="520" y2="80"/><line x1="0" y1="122" x2="520" y2="122"/></g>
      <path d="M${incPts.split(' ').join(' L')} L520,150 L0,150Z" fill="url(#gi)"/>
      <polyline points="${incPts}" fill="none" stroke="#2f9e6b" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
      <polyline points="${expPts}" fill="none" stroke="#c1504a" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`
    const axis = document.querySelector('#v-overview .xaxis')
    if (axis) axis.innerHTML = months.filter((_, i) => i % 2 === 0).map(m => `<span>${Number(m.slice(5))}月</span>`).join('')
  }

  const DONUT_COLORS = ['#4f5bd5', '#7c86ff', '#34c759', '#ff9500', '#c1504a', '#af52de', '#32ade6', '#a2845e']
  function renderDonut(expList) {
    const byCat = {}
    expList.forEach(x => { byCat[x.cat] = (byCat[x.cat] || 0) + toCents(x.amt) })
    const arr = Object.keys(byCat).map(k => {
      const c = catsOut.concat(catsIn).find(z => z.id === k)
      return { name: c ? c.n : k, id: k, c: c ? c.c : '#8e8e93', v: toYuan(byCat[k]) }
    }).sort((a, b) => b.v - a.v)
    const donut = document.querySelector('#v-overview .donut')
    const listEl = document.querySelector('#v-overview .cat-list')
    if (!donut || !listEl) return
    const total = sumYuan(arr.map(a => a.v))
    const center = donut.querySelector('.donut-center b')
    if (center) center.textContent = '¥' + Math.round(total).toLocaleString('zh-CN')
    if (!arr.length) {
      donut.style.background = 'var(--surface2)'
      listEl.innerHTML = '<div style="font-size:12px;color:var(--label3)">本月暂无支出</div>'
      return
    }
    // conic-gradient 按占比连续绘制
    let acc = 0
    const stops = []
    arr.slice(0, 8).forEach((a, i) => {
      const from = acc / total * 100
      acc += toCents(a.v)
      const to = acc / total * 100
      stops.push(`${DONUT_COLORS[i % DONUT_COLORS.length]} ${from}% ${to}%`)
    })
    donut.style.background = `conic-gradient(${stops.join(',')})`
    listEl.innerHTML = arr.slice(0, 8).map((a, i) => {
      const pct = Math.round(toCents(a.v) / toCents(total) * 100)
      return `<div class="cat-row"><i class="dot" style="background:${DONUT_COLORS[i % DONUT_COLORS.length]}"></i><span class="name">${esc(a.name)}</span><span class="amt num">${a.v.toLocaleString('zh-CN')}</span><span class="pct">${pct}%</span></div>`
    }).join('')
  }

  // ---------- 导航 ----------
  document.querySelectorAll('.nav button').forEach(b => b.onclick = () => {
    document.querySelectorAll('.nav button').forEach(x => x.classList.remove('active'))
    b.classList.add('active')
    const v = b.dataset.v
    document.querySelectorAll('.view').forEach(s => s.classList.toggle('active', s.id === 'v-' + v))
    document.querySelector('.content').scrollTop = 0
    if (v === 'stats') renderStats()
    if (v === 'cats') renderCats()
  })
  document.querySelectorAll('.link[data-go]').forEach(e => e.onclick = () =>
    document.querySelector(`.nav button[data-v="${e.dataset.go}"]`).click())
  document.querySelectorAll('#segTime button').forEach(b => b.onclick = () => {
    document.querySelectorAll('#segTime button').forEach(x => x.classList.remove('on'))
    b.classList.add('on'); renderStats()
  })
  // 检索 chips（Q11）
  let activeFilter = '全部'
  document.querySelectorAll('.chips .chip').forEach(c => c.onclick = () => {
    document.querySelectorAll('.chips .chip').forEach(x => x.classList.remove('on'))
    c.classList.add('on'); activeFilter = c.textContent
    let list = txs
    if (activeFilter === '支出') list = txs.filter(x => x.out)
    if (activeFilter === '收入') list = txs.filter(x => !x.out)
    document.getElementById('fullList').innerHTML = groupByDate(list, true)
    document.querySelectorAll('#fullList .del').forEach(b => b.onclick = () => trashRecord(b.dataset.id, 1))
  })
  document.querySelector('.search').onclick = () => {
    const kw = prompt('输入备注关键词搜索：')
    if (!kw) return
    const list = txs.filter(x => (x.note || '').toLowerCase().includes(kw.toLowerCase()))
    document.getElementById('fullList').innerHTML = groupByDate(list, true)
    document.querySelectorAll('#fullList .del').forEach(b => b.onclick = () => trashRecord(b.dataset.id, 1))
    document.querySelector('.nav button[data-v="list"]').click()
  }

  // ---------- 统计（Q9/Q10）----------
  function renderStats() {
    const live = txs.filter(x => !x.deleted)
    const dim = (document.querySelector('#segTime button.on') || {}).textContent || '月'
    let list = live
    if (dim === '月') { const ym = new Date().toISOString().slice(0, 7); list = live.filter(x => x.date.startsWith(ym)) }
    else if (dim === '年') { const y = new Date().getFullYear(); list = live.filter(x => x.date.startsWith(String(y))) }
    else if (dim === '近3年') { const y = new Date().getFullYear() - 2; list = live.filter(x => +x.date.slice(0, 4) >= y) }
    else if (dim === '近5年') { const y = new Date().getFullYear() - 4; list = live.filter(x => +x.date.slice(0, 4) >= y) }
    const byCat = {}
    list.filter(x => x.out).forEach(x => byCat[x.cat] = (byCat[x.cat] || 0) + toCents(x.amt))
    const arr = Object.keys(byCat).map(k => {
      const c = catsOut.concat(catsIn).find(z => z.id === k)
      return { name: c ? c.n : k, v: toYuan(byCat[k]) }
    }).sort((a, b) => b.v - a.v)
    const max = arr.length ? arr[0].v : 1
    document.getElementById('barChart').innerHTML = arr.length ? arr.map(b =>
      `<div style="display:flex;align-items:center;gap:12px;margin:9px 0">
        <span style="width:44px;font-size:12px;color:var(--label2)">${esc(b.name)}</span>
        <div style="flex:1;background:rgba(120,120,140,.10);border-radius:6px;height:16px;overflow:hidden">
          <div style="width:${b.v / max * 100}%;height:100%;border-radius:6px;background:linear-gradient(90deg,#4f5bd5,#7c86ff);transition:width .7s var(--ease-spring)"></div></div>
        <span class="num" style="width:70px;text-align:right;font-size:13px;font-weight:600">${money(b.v)}</span>
      </div>`).join('') : '<div style="color:var(--label3);font-size:13px;padding:12px">该时间段暂无支出</div>'
    // 热力（当日支出）
    const heat = {}
    list.filter(x => x.out).forEach(x => heat[x.date] = (heat[x.date] || 0) + x.amt)
    const maxH = Math.max(1, ...Object.values(heat))
    let html = ''
    for (let i = 0; i < 126; i++) {
      const d = new Date(); d.setDate(d.getDate() - (125 - i))
      const key = d.toISOString().slice(0, 10)
      const v = heat[key] || 0
      const a = v ? 0.15 + 0.65 * (v / maxH) : 0.06
      html += `<i style="background:rgba(79,91,213,${a.toFixed(2)})" title="${key} ${v ? money(v) : '无支出'}"></i>`
    }
    document.getElementById('heat').innerHTML = html
  }

  // ---------- 分类管理（Q5）----------
  function renderCats() {
    document.getElementById('catGridOut').innerHTML = catsOut.map(c =>
      `<div class="catcard"><div class="e" style="background:${c.c}1c">${c.e}</div><b>${esc(c.n)}</b><span>点击编辑</span></div>`).join('')
    document.getElementById('catGridIn').innerHTML = catsIn.map(c =>
      `<div class="catcard"><div class="e" style="background:${c.c}1c">${c.e}</div><b>${esc(c.n)}</b><span>点击编辑</span></div>`).join('')
  }

  // ---------- 记一笔（Q3/Q4）----------
  let curAmt = '0', curType = 'out', curCat = 0
  const amtEl = document.getElementById('amt')
  const updAmt = () => amtEl.textContent = curAmt || '0'
  function renderPick() {
    const list = curType === 'out' ? catsOut : catsIn
    document.getElementById('pickcat').innerHTML = list.map((c, i) =>
      `<div class="pc ${i === curCat ? 'on' : ''}" data-i="${i}"><div class="e" style="background:${c.c}22">${c.e}</div><span>${esc(c.n)}</span></div>`).join('')
    document.querySelectorAll('.pc').forEach(p => p.onclick = () => { curCat = +p.dataset.i; renderPick() })
  }
  renderPick()
  document.getElementById('addBtn').onclick = () => {
    document.getElementById('backdrop').classList.add('show')
    curAmt = '0'; pendingImage = null; updAmt()
    setTimeout(() => document.getElementById('note').focus(), 300)
  }
  document.getElementById('backdrop').onclick = e => { if (e.target.id === 'backdrop') document.getElementById('backdrop').classList.remove('show') }
  document.querySelectorAll('#segType button').forEach(b => b.onclick = () => {
    document.querySelectorAll('#segType button').forEach(x => x.classList.remove('on'))
    b.classList.add('on'); curType = b.textContent === '支出' ? 'out' : 'in'; curCat = 0; renderPick()
  })
  document.querySelectorAll('#keypad button').forEach(b => b.onclick = async () => {
    const t = b.textContent
    if (/^\d$/.test(t)) { curAmt = curAmt === '0' ? t : curAmt + t; if (curAmt.length > 8) curAmt = curAmt.slice(0, 8) }
    else if (t === '.') { if (!curAmt.includes('.')) curAmt += '.' }
    else if (t === '⌫') { curAmt = curAmt.slice(0, -1) || '0' }
    else if (t === '清空') { curAmt = '0' }
    else if (t === '▣') { await pickImage(); return }
    else if (t === '完成') { await commit(); return }
    updAmt()
  })
  async function pickImage() {
    if (!IN_TAURI) { toast('小票图片需 Tauri 环境'); return }
    try {
      const p = await window.__TAURI__.dialog.open({ multiple: false, filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp'] }] })
      if (!p) return
      pendingImage = await invoke('save_image', { srcPath: p, name: 'receipt_' + Date.now() + '.png' })
      toast('小票图片已保存到本地')
    } catch (e) { toast('选择图片失败：' + e) }
  }
  async function commit() {
    const v = parseFloat(curAmt)
    if (!v || v <= 0) { toast('请输入金额'); return }
    const list = curType === 'out' ? catsOut : catsIn, c = list[curCat]
    const d = new Date()
    const x = {
      cat: c.id, ic: c.e, bg: c.c + '1f', out: curType === 'out', amt: v,
      note: document.getElementById('note').value || c.n, image: pendingImage || '',
      date: d.toISOString().slice(0, 10), ts: d.getTime(), deleted: false
    }
    await saveRecord(x)
    document.getElementById('note').value = ''
    document.getElementById('backdrop').classList.remove('show')
    await loadRecords()
    toast((curType === 'out' ? '支出 ' : '收入 ') + money(v) + ' 已记录')
  }

  // ---------- 导出 / 备份（Q12/Q22）----------
  async function downloadText(name, text, mime) {
    if (IN_TAURI) {
      try {
        const path = await window.__TAURI__.dialog.save({ defaultPath: name })
        if (path) { await window.__TAURI__.fs.writeTextFile(path, text); toast('已保存到 ' + path); return }
      } catch (e) { /* fall through */ }
    }
    const blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click()
    URL.revokeObjectURL(a.href)
  }
  function buildCSV() {
    const live = txs.filter(x => !x.deleted)
    const escCsv = v => { let s = String(v == null ? '' : v); if (/^[=+\-@]/.test(s)) s = "'" + s; if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"'; return s }
    const rows = [['日期', '类型', '分类', '金额', '备注'].join(',')]
    live.forEach(x => {
      const c = catsOut.concat(catsIn).find(z => z.id === x.cat)
      rows.push([x.date, x.out ? '支出' : '收入', c ? c.n : x.cat, x.amt.toFixed(2), x.note].map(escCsv).join(','))
    })
    return rows.join('\r\n')
  }
  document.querySelectorAll('.setrow').forEach(row => {
    if (row.textContent.includes('导出数据')) row.querySelector('.link').onclick = async () => {
      await downloadText('简记-流水.csv', buildCSV(), 'text/csv;charset=utf-8'); toast('CSV 已导出')
    }
  })

  // toast
  let tt
  function toast(msg) {
    const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show')
    clearTimeout(tt); tt = setTimeout(() => t.classList.remove('show'), 2000)
  }

  // ---------- 热更新（自动更新）----------
  async function initUpdater() {
    const $ = id => document.getElementById(id)
    // 浏览器预览：隐藏全部更新入口（保留"当前版本"占位）
    if (!IN_TAURI) {
      ;['row-upd-check', 'row-upd-auto', 'row-upd-src'].forEach(id => { if ($(id)) $(id).style.display = 'none' })
      if ($('upd-curver')) $('upd-curver').textContent = '浏览器预览模式'
      return
    }
    try {
      const ver = await window.__TAURI__.app.getVersion()
      if ($('upd-version')) $('upd-version').textContent = 'v' + ver
    } catch (e) { /* 版本显示失败不阻塞 */ }

    // 偏好持久化：复用 get_setting/set_setting
    const getSet = async k => { try { return await invoke('get_setting', { key: k }) } catch (e) { return null } }
    const setSet = (k, v) => invoke('set_setting', { key: k, value: v }).catch(() => {})
    let autoCheck = (await getSet('auto_update_check')) !== '0'   // 默认开
    let src = await getSet('update_source') || 'auto'             // auto | official | mirror

    const autoEl = $('upd-auto')
    if (autoEl) autoEl.classList.toggle('on', autoCheck)
    if (autoEl) autoEl.onclick = () => { autoCheck = !autoCheck; autoEl.classList.toggle('on', autoCheck); setSet('auto_update_check', autoCheck ? '1' : '0') }
    const SRC_LABEL = { auto: '自动', official: '官方 GitHub', mirror: '国内镜像' }
    const srcEl = $('upd-src')
    if (srcEl) {
      srcEl.textContent = SRC_LABEL[src] + ' ›'
      srcEl.onclick = () => {
        const order = ['auto', 'official', 'mirror']
        src = order[(order.indexOf(src) + 1) % order.length]
        srcEl.textContent = SRC_LABEL[src] + ' ›'
        setSet('update_source', src)
        toast('更新下载源：' + SRC_LABEL[src])
      }
    }

    // 检查 + 询问 + 下载安装
    // 状态持久显示在「检查更新」行副文字（upd-status），失败原因不丢失，便于诊断
    // 确认框必须自绘：WebView2 下原生 confirm() 不可靠（对话框不显示 / 同步返回假值）
    const STATUS_EL = $('upd-status')
    const STATUS_DEFAULT = '自动下载并静默安装新版本'
    function setStatus(t) { if (STATUS_EL) STATUS_EL.textContent = t || STATUS_DEFAULT }
    function confirmUpdate(msg) {
      return new Promise(resolve => {
        const mask = $('upd-modal'), msgEl = $('upd-modal-msg')
        if (!mask || !msgEl) { resolve(false); return }
        msgEl.textContent = msg
        mask.classList.add('show')
        const ok = $('upd-modal-ok'), cancel = $('upd-modal-cancel')
        const done = v => {
          mask.classList.remove('show')
          ok.onclick = cancel.onclick = mask.onclick = null
          resolve(v)
        }
        ok.onclick = () => done(true)
        cancel.onclick = () => done(false)
        mask.onclick = e => { if (e.target === mask) done(false) }
      })
    }
    let busy = false
    async function checkAndOffer(silent) {
      if (busy) return
      busy = true
      try {
        if (!silent) { toast('正在检查更新…'); setStatus('正在检查更新…') }
        const meta = await invoke('updater_check', { source: src })
        if (!meta) {
          if (!silent) { toast('当前已是最新版本'); setStatus('当前已是最新版本（' + new Date().toLocaleTimeString() + ' 检查）') }
          return
        }
        setStatus('发现新版本 v' + meta.version)
        const yes = await confirmUpdate(`发现新版本 v${meta.version}（当前 v${meta.current_version}）\n\n${meta.notes || '暂无更新说明'}\n\n立即下载并安装？`)
        if (!yes) { setStatus('已跳过 v' + meta.version + '，可再次点击「立即检查」'); return }
        let lastPct = -10
        const stop = await window.__TAURI__.event.listen('updater://progress', ev => {
          const { downloaded, total } = ev.payload || {}
          if (total) {
            const pct = Math.floor(downloaded / total * 100)
            if (pct >= lastPct + 10) { lastPct = pct; toast(`下载中 ${pct}%`); setStatus('下载中 ' + pct + '%') }
          }
        })
        try {
          toast('开始下载更新…'); setStatus('开始下载更新…')
          await invoke('updater_download_install')
          toast('下载完成，正在安装…'); setStatus('下载完成，正在安装…')
          // Windows 下 install 会自动退出应用；若未退出则主动重启
          setTimeout(async () => {
            try { await window.__TAURI__.process.relaunch() } catch (e) { }
          }, 3000)
        } finally { stop().catch(() => {}) }
      } catch (e) {
        const msg = '检查更新失败：' + (e && e.message || e)
        if (!silent) toast(msg)
        setStatus(msg) // 失败原因持久显示（含静默检查），便于诊断
      } finally { busy = false }
    }
    if ($('upd-check')) $('upd-check').onclick = () => checkAndOffer(false)

    // 启动静默检查：延后 3s 避开启动期 IO，异常吞掉
    if (autoCheck) setTimeout(() => checkAndOffer(true), 3000)
  }

  // 启动
  loadRecords()
  initUpdater()
})()
