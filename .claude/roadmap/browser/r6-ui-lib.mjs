// Shared dialog and canvas helpers of the R6 browser checks T23 to T25 (auto-routing-r6.md). Imports r6-lib.mjs of the same folder.
// Each control is driven through the real DOM or real mouse and keyboard events. The scene API sets up a project and reads state.
import { screenOf, markedIds, exportRun } from './r6-lib.mjs';

export const R = '.mep-modal--route';

export function helpers(t) {
  const { page, idle, check } = t;
  const tid = (id) => page.locator(`${R} [data-testid="${id}"]`);

  const openDialog = async () => {
    await t.openRoute();
    await page.locator(R).waitFor({ state: 'visible', timeout: 5000 });
    await idle(600);
  };
  const closeDialog = async () => {
    await page.locator(`${R} button`, { hasText: /^Close$/ }).first().click();
    await idle(500);
  };
  const waitPlan = async () => {
    await idle(500);
    for (let i = 0; i < 60; i++) {
      if ((await tid('route-build-pending').count()) === 0) break;
      await page.waitForTimeout(250);
    }
    await idle(200);
  };
  const selectInputs = async (type, port = 'out', start = 'ahu') => {
    await tid('route-start').selectOption(start);
    await tid('route-type').selectOption(type);
    await tid('route-port').selectOption(port);
  };
  const setRooms = async (roomIds, on) => {
    for (const id of roomIds) {
      const box = page.locator(`${R} [data-testid="route-room"][data-room-id="${id}"]`);
      if (on) await box.check();
      else await box.uncheck();
    }
    await waitPlan();
  };
  const summaryNumbers = async () => {
    await tid('route-build-summary').waitFor({ state: 'visible', timeout: 8000 });
    const text = await tid('route-build-summary').innerText();
    const m = text.match(/(\d+) segments?, (\d+) fittings?, (\d+) m\. (\d+) rooms?, (\d+) ports?\./);
    return m ? { segments: +m[1], fittings: +m[2], length: +m[3], rooms: +m[4], ports: +m[5], text } : { text };
  };
  const lineOf = async (code) => {
    const l = tid(code === 'removes-routed' ? 'route-build-remove' : `route-build-line-${code}`);
    return (await l.count()) > 0 ? { text: (await l.first().innerText()).trim(), severity: await l.first().getAttribute('data-severity') } : null;
  };
  /** The codes of all lines of the Route section with their severity. */
  const lineCodes = async () => tid('route-build-lines').locator('[data-testid]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid').replace('route-build-line-', '') + ':' + e.getAttribute('data-severity'))).catch(() => []);
  /** Numbers of the removal line: { segments, fittings } or null. */
  const removeNumbers = async () => {
    const line = await lineOf('removes-routed');
    const m = line?.text.match(/removes (\d+) segments?(?: and (\d+) fittings?)?/);
    const f = line?.text.match(/(\d+) fittings?/);
    return line ? { segments: +m[1], fittings: f ? +f[1] : 0, text: line.text } : null;
  };
  /** Opens the dialog, picks the inputs, sets the rooms off, waits for the plan, presses Place and closes the dialog. */
  const placeRun = async ({ type = 'supply-air', port = 'out', start = 'ahu', roomsOff = [] } = {}) => {
    await openDialog();
    await selectInputs(type, port, start);
    if (roomsOff.length) await setRooms(roomsOff, false);
    await waitPlan();
    await tid('route-place').click();
    await tid('route-build-result').waitFor({ state: 'visible', timeout: 8000 });
    const text = (await tid('route-build-result').innerText()).trim();
    await closeDialog();
    const m = text.match(/Placed (\d+) segments? and (\d+) fittings?/);
    return { segments: +m[1], fittings: +m[2], text };
  };
  const exp = async () => {
    const run = await exportRun(page);
    return { segs: run.segments, fits: run.fittings, marked: await markedIds(page) };
  };
  const undo = async () => {
    await page.locator('.mep-rail-btn[title="Undo"]').click();
    await idle(700);
  };
  /** Runs `mutate(p, arg)` on a copy of the export and loads it again. */
  const reload = async (mutate, arg) => {
    await page.evaluate(([fn, arg]) => {
      const s = window.__mepSketchScene;
      const p = s.exportProject();
      new Function('p', 'arg', fn)(p, arg);
      s.loadProjectFromJson(p);
    }, [mutate, arg ?? null]);
    await idle(1500);
  };
  const centerOn = async (p, x = 800, y = 500) => {
    await page.evaluate(([p, x, y]) => {
      const s = window.__mepSketchScene;
      s.world.position.set(x - p.x * s.world.scale.x, y - p.y * s.world.scale.y);
    }, [p, x, y]);
    await idle(500);
  };
  const tool = async (title) => {
    await page.locator(`button.mep-rail-btn[title="${title}"]`).click();
    await idle(300);
  };
  const click = async (p) => {
    const at = await screenOf(page, p);
    await page.mouse.click(at.x, at.y);
    await idle(500);
    return at;
  };
  /** Draws one segment with the real Segment tool: click the start point, click the end point, Escape. Points are page points. */
  const drawSegment = async (from, to) => {
    await tool('Segment');
    await click(from);
    await click(to);
    await page.keyboard.press('Escape');
    await idle(300);
    await tool('Select');
  };
  const drag = async (fromScreen, dx, dy) => {
    await page.mouse.move(fromScreen.x, fromScreen.y);
    await page.mouse.down();
    await page.mouse.move(fromScreen.x + dx, fromScreen.y + dy, { steps: 8 });
    await page.mouse.up();
    await idle(600);
  };
  const portPoint = (stampId, portId = null) =>
    page.evaluate(([id, portId]) => {
      const st = window.__mepSketchScene.exportProject().stamps.find((x) => x.id === id);
      const p = portId ? st.ports.find((q) => q.id === portId) : st.ports[0];
      const sx = st.transform.scale?.x ?? 1;
      const sy = st.transform.scale?.y ?? 1;
      return { x: st.transform.position.x + (p.fractionX - 0.5) * st.nativeWidth * sx, y: st.transform.position.y + (p.fractionY - 0.5) * st.nativeHeight * sy };
    }, [stampId, portId]);
  /** A second equipment stamp 'ahu2' (port out) beside 'ahu', same size, same type of start port. */
  const addSecondEquipment = (dx = 100, dy = 0) =>
    reload(
      `const a = p.stamps.find((s) => s.id === 'ahu');
       const b = JSON.parse(JSON.stringify(a));
       b.id = 'ahu2';
       b.transform = { ...b.transform, position: { x: a.transform.position.x + arg.dx, y: a.transform.position.y + arg.dy } };
       p.stamps = [...p.stamps, b];`,
      { dx, dy },
    );
  const segmentMid = (s) => ({ x: (s.geometry[0].x + s.geometry[s.geometry.length - 1].x) / 2, y: (s.geometry[0].y + s.geometry[s.geometry.length - 1].y) / 2 });
  const len = (s) => Math.hypot(s.geometry[s.geometry.length - 1].x - s.geometry[0].x, s.geometry[s.geometry.length - 1].y - s.geometry[0].y);
  const sameIds = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
  const scrollTo = async (id, block = 'center') => {
    await tid(id).first().evaluate((el, b) => el.scrollIntoView({ block: b }), block);
    await idle(300);
  };
  return {
    tid, openDialog, closeDialog, waitPlan, selectInputs, setRooms, summaryNumbers, lineOf, lineCodes, removeNumbers, placeRun, exp, undo, reload, centerOn, tool, click, drawSegment, drag,
    portPoint, addSecondEquipment, segmentMid, len, sameIds, scrollTo, check,
  };
}
