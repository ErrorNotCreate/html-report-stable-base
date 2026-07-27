(() => {
  const SUPPORTED_TYPES = new Set(['text', 'shape', 'chart', 'image']);
  const STYLE_CONTROLS = {
    elementWidth: ['width', 'px'],
    elementHeight: ['height', 'px'],
    elementFontSize: ['fontSize', 'px'],
    elementColor: ['color', ''],
    elementFontWeight: ['fontWeight', ''],
    elementTextAlign: ['textAlign', ''],
    elementLineHeight: ['lineHeight', ''],
    elementBackground: ['backgroundColor', ''],
    elementBorderColor: ['borderColor', ''],
    elementBorderWidth: ['borderWidth', 'px'],
    elementBorderRadius: ['borderRadius', 'px'],
  };

  let selectedElement = null;
  let recognitionPickMode = false;
  let recognitionCandidate = null;
  let documentClickBound = false;
  let sectionNavBound = false;
  let typographyResizeBound = false;
  const globalDefaults = new Map();
  const MODULE_ICONS = {
    '浏览与模式': '⌘',
    '全局样式': 'Aa',
    '对象编辑': '◉',
    '表格设置': '▦',
    '图表数据': '▧',
    '修复识别': '＋',
    '导出': '⇩',
    '导航样式': '◎',
    '章节导航': '◎',
    '排版设置': 'Aa',
    '全局排版': 'Aa',
    '补充识别': '＋',
    '元素独立样式': '◉',
    '元素尺寸': '↔',
    '文本样式': 'T',
    '框体样式': '□',
  };

  function accordionGroups() {
    return [...document.querySelectorAll('.drawer-body > .control-group, .drawer-repair > .control-group')];
  }

  function editModeEnabled() {
    return document.body.classList.contains('edit-mode');
  }

  function setDataEditContext(context = '') {
    if (context) document.body.dataset.dataEditContext = context;
    else delete document.body.dataset.dataEditContext;
    refreshDataGroupAvailability();
  }

  function pxNumber(value, fallback = 0) {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function elementType(element) {
    return element?.dataset.editableElement || '';
  }

  function isSinglePageMode() {
    return document.body.dataset.reportMode === 'single-page';
  }

  function shortSectionTitle(title) {
    return Array.from(String(title || '').trim()).slice(0, 6).join('');
  }

  function setAccordionGroupOpen(group, open) {
    const toggle = group.querySelector(':scope > .control-group-toggle');
    const content = group.querySelector(':scope > .control-group-content');
    if (!toggle || !content) return;
    if (open) {
      accordionGroups().forEach(otherGroup => {
        if (otherGroup !== group) setAccordionGroupOpen(otherGroup, false);
      });
    }
    group.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    content.hidden = !open;
  }

  function initAccordionGroups() {
    accordionGroups().forEach((group, index) => {
      if (group.dataset.accordionInitialized === 'true') return;
      const heading = group.querySelector(':scope > h4');
      if (!heading) return;

      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'control-group-toggle';
      toggle.textContent = heading.textContent.trim();
      toggle.dataset.moduleIcon = MODULE_ICONS[toggle.textContent] || '•';
      toggle.setAttribute('aria-expanded', 'false');

      const content = document.createElement('div');
      content.className = 'control-group-content';
      content.id = `control-group-content-${index + 1}`;
      content.hidden = true;
      toggle.setAttribute('aria-controls', content.id);

      heading.replaceWith(toggle);
      [...group.children].forEach(child => {
        if (child !== toggle) content.appendChild(child);
      });
      group.appendChild(content);
      group.dataset.accordionInitialized = 'true';

      toggle.addEventListener('click', () => {
        const open = toggle.getAttribute('aria-expanded') !== 'true';
        setAccordionGroupOpen(group, open);
      });
      setAccordionGroupOpen(group, false);
    });
  }

  function openAccordionGroup(label) {
    const groups = accordionGroups();
    const target = groups.find(group => {
      const toggle = group.querySelector(':scope > .control-group-toggle');
      const heading = group.querySelector(':scope > h4');
      return (toggle?.textContent || heading?.textContent || '').trim() === label;
    });
    if (target) setAccordionGroupOpen(target, true);
  }

  function openDrawerGroupByIntent(intent) {
    const group = document.querySelector(`.drawer-body > .control-group[data-drawer-intent="${intent}"], .drawer-repair > .control-group[data-drawer-intent="${intent}"]`);
    if (group?.classList.contains('is-unavailable')) return;
    if (group) setAccordionGroupOpen(group, true);
  }

  function refreshDataGroupAvailability() {
    [
      {
        intent: 'table',
        available: document.body.dataset.dataEditContext === 'table',
        title: '选中表格单元格后可用',
      },
      {
        intent: 'chart',
        available: selectedElement && elementType(selectedElement) === 'chart',
        title: '选中 ECharts 图表后可用',
      },
    ].forEach(({ intent, available, title }) => {
      const group = document.querySelector(`.drawer-body > .control-group[data-drawer-intent="${intent}"]`);
      if (!group) return;
      const unavailable = editModeEnabled() && !available;
      group.classList.toggle('is-unavailable', unavailable);
      const toggle = group.querySelector(':scope > .control-group-toggle');
      if (toggle) {
        toggle.disabled = unavailable;
        toggle.setAttribute('aria-disabled', String(unavailable));
        toggle.title = unavailable ? title : '';
      }
      group.querySelectorAll('input, select, textarea, button').forEach(control => {
        if (!control.classList.contains('edit-only')) return;
        control.disabled = unavailable || !editModeEnabled();
      });
      if (unavailable && group.classList.contains('is-open')) setAccordionGroupOpen(group, false);
    });
  }

  function reportScale() {
    if (document.body.dataset.reportMode !== 'ppt') return 1;
    const activeSlide = document.querySelector('.slide.active-slide');
    if (activeSlide?.offsetWidth) {
      const scale = activeSlide.getBoundingClientRect().width / activeSlide.offsetWidth;
      if (Number.isFinite(scale) && scale > 0) return scale;
    }
    const scale = typeof window.currentStageScale === 'function' ? Number(window.currentStageScale()) : 1;
    return Number.isFinite(scale) && scale > 0 ? scale : 1;
  }

  function refreshElementControls() {
    const type = elementType(selectedElement);
    document.querySelectorAll('.element-control-group').forEach(group => {
      const types = (group.dataset.elementTypes || '').split(/\s+/).filter(Boolean);
      group.hidden = !selectedElement || !types.includes(type);
    });
    document.querySelectorAll('.element-empty-state').forEach(note => {
      note.hidden = Boolean(selectedElement);
    });
    document.querySelectorAll('.element-selected-state').forEach(state => {
      state.hidden = !selectedElement;
    });
    document.querySelectorAll('[data-selected-element-label]').forEach(label => {
      label.textContent = selectedElement ? `已选中：${selectedElement.dataset.pptxName || selectedElement.dataset.editableElement || '元素'}` : '';
    });
    refreshDataGroupAvailability();
    if (!selectedElement) {
      refreshChartDataControls();
      return;
    }
    const style = getComputedStyle(selectedElement);
    Object.entries(STYLE_CONTROLS).forEach(([id, [property]]) => {
      const input = document.getElementById(id);
      if (!input) return;
      const value = style[property];
      if (id === 'elementWidth') input.value = Math.round(selectedElement.getBoundingClientRect().width / reportScale());
      else if (id === 'elementHeight') input.value = Math.round(selectedElement.getBoundingClientRect().height / reportScale());
      else if (input.type === 'color') {
        input.value = rgbToHex(value) || input.value;
        const hexInput = document.querySelector(`[data-color-target="${id}"]`);
        if (hexInput) hexInput.value = input.value.toUpperCase();
      }
      else if (id === 'elementFontSize' || id === 'elementBorderWidth' || id === 'elementBorderRadius') input.value = Math.round(pxNumber(value));
      else input.value = value;
    });
    refreshChartDataControls();
  }

  function rememberGlobalDefaults() {
    refreshGlobalControlsFromComputedTypography();
    document.querySelectorAll('[data-global-var]').forEach(input => {
      if (!globalDefaults.has(input.dataset.globalVar)) globalDefaults.set(input.dataset.globalVar, input.value);
    });
    const fontFamily = document.getElementById('fontFamily');
    if (fontFamily && !globalDefaults.has('fontFamily')) globalDefaults.set('fontFamily', fontFamily.value);
  }

  function resetGlobalControls() {
    const fontFamily = document.getElementById('fontFamily');
    if (fontFamily && globalDefaults.has('fontFamily')) {
      fontFamily.value = globalDefaults.get('fontFamily');
      document.documentElement.style.removeProperty('--font-family');
    }
    document.querySelectorAll('[data-global-var]').forEach(input => {
      if (!globalDefaults.has(input.dataset.globalVar)) return;
      input.value = globalDefaults.get(input.dataset.globalVar);
      const unit = input.dataset.unit ?? (input.dataset.globalVar === '--body-line-height' ? '' : 'px');
      document.documentElement.style.removeProperty(input.dataset.globalVar);
      const out = document.querySelector(`[data-global-out="${input.dataset.globalVar}"]`);
      if (out) out.textContent = input.value;
    });
    document.body.classList.remove('global-typography-active', 'global-font-active');
    refreshTypographyLabels();
  }

  function scopeForGlobalControlSampling() {
    if (document.body.dataset.reportMode === 'ppt') {
      return document.querySelector('.slide.active-slide') || document.querySelector('#deck .slide') || document.querySelector('main');
    }
    return document.querySelector('main') || document.body;
  }

  function firstVisibleElement(selectors) {
    const scope = scopeForGlobalControlSampling();
    if (!scope) return null;
    const elements = selectors.flatMap(selector => [...scope.querySelectorAll(selector)]);
    return elements.find(element => {
      if (!(element instanceof Element)) return false;
      if (element.closest('.style-drawer, .drawer-toggle, #nav, #sectionNav')) return false;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    }) || null;
  }

  function computedPxInputValue(element, property = 'fontSize') {
    if (!element) return '';
    const value = pxNumber(getComputedStyle(element)[property], NaN);
    return Number.isFinite(value) ? String(Math.round(value)) : '';
  }

  function computedLineHeightValue(element) {
    if (!element) return '';
    const style = getComputedStyle(element);
    const lineHeight = pxNumber(style.lineHeight, NaN);
    const fontSize = pxNumber(style.fontSize, NaN);
    if (!Number.isFinite(lineHeight)) return '';
    if (Number.isFinite(fontSize) && fontSize > 0) {
      return String(Math.round((lineHeight / fontSize) * 100) / 100);
    }
    return String(Math.round(lineHeight));
  }

  function setGlobalInputDisplay(globalVar, value) {
    if (value === '') return;
    const input = document.querySelector(`[data-global-var="${globalVar}"]`);
    if (!input) return;
    input.value = value;
    const out = document.querySelector(`[data-global-out="${globalVar}"]`);
    if (out) out.textContent = value;
  }

  function refreshGlobalControlsFromComputedTypography() {
    const samples = {
      '--h1-size': firstVisibleElement(['[data-ppt-level="h1"]', 'h1']),
      '--h2-size': firstVisibleElement(['[data-ppt-level="h2"]', 'h2']),
      '--h3-size': firstVisibleElement(['[data-ppt-level="h3"]', 'h3']),
      '--h4-size': firstVisibleElement(['[data-ppt-level="h4"]', 'h4', '.subtitle']),
      '--metric-size': firstVisibleElement(['[data-ppt-level="metric"]', '.metric .value', '.metric strong']),
      '--body-size': firstVisibleElement(['[data-ppt-level="body"]', 'p', 'li', 'td', 'th', '.body-text']),
      '--note-size': firstVisibleElement(['[data-ppt-level="note"]', '.note']),
    };
    Object.entries(samples).forEach(([globalVar, element]) => {
      setGlobalInputDisplay(globalVar, computedPxInputValue(element));
    });
    setGlobalInputDisplay('--body-line-height', computedLineHeightValue(samples['--body-size']));

    const tableCell = firstVisibleElement(['td', 'th']);
    if (tableCell) {
      const style = getComputedStyle(tableCell);
      setGlobalInputDisplay('--table-cell-padding-y', computedPxInputValue(tableCell, 'paddingTop') || computedPxInputValue(tableCell, 'paddingBottom'));
      setGlobalInputDisplay('--table-cell-padding-x', computedPxInputValue(tableCell, 'paddingLeft') || computedPxInputValue(tableCell, 'paddingRight'));
    }
  }

  function resetSelectedStyles(properties) {
    if (!selectedElement) return;
    properties.forEach(property => { selectedElement.style[property] = ''; });
    resizeSelectedChart();
    refreshElementControls();
    refreshTypographyLabels();
    window.dispatchEvent(new Event('resize'));
  }

  function addGroupReset(titles, label, onReset) {
    const titleList = Array.isArray(titles) ? titles : [titles];
    const group = [...document.querySelectorAll('.drawer-body > .control-group, .drawer-repair > .control-group, .drawer-subgroup')].find(candidate => {
      const toggle = candidate.querySelector(':scope > .control-group-toggle');
      const heading = candidate.querySelector(':scope > h5, :scope > h4');
      const title = (toggle?.textContent || heading?.textContent || '').trim();
      return titleList.includes(title);
    });
    const content = group?.querySelector(':scope > .control-group-content') || group;
    if (!content || content.querySelector(':scope > .group-reset-btn')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'group-reset-btn edit-only';
    button.textContent = label;
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      onReset();
    });
    content.appendChild(button);
  }

  function initResetButtons() {
    addGroupReset(['全局样式', '全局排版', '排版设置'], '重置排版设置', resetGlobalControls);
    addGroupReset('元素尺寸', '重置元素尺寸', () => resetSelectedStyles(['width', 'height']));
    addGroupReset('文本样式', '重置文本样式', () => resetSelectedStyles(['fontSize', 'color', 'fontWeight', 'textAlign', 'lineHeight']));
    addGroupReset('框体样式', '重置框体样式', () => resetSelectedStyles(['backgroundColor', 'borderColor', 'borderWidth', 'borderRadius']));
  }

  function typographyLevel(element) {
    if (!element || !(element instanceof Element)) return '正文';
    if (element.matches('[data-ppt-level="metric"], .metric .value, .metric strong')) return '指标';
    if (element.matches('.note, [data-ppt-level="note"]') || element.closest('.note')) return '备注';
    if (element.matches('h1, [data-ppt-level="h1"]')) return 'L1';
    if (element.matches('h2, [data-ppt-level="h2"]')) return 'L2';
    if (element.matches('h3, [data-ppt-level="h3"]')) return 'L3';
    if (element.matches('h4, [data-ppt-level="h4"]')) return 'L4';
    return '正文';
  }

  function typographyTargets() {
    if (!isSinglePageMode()) return [];
    return [...document.querySelectorAll('main h1, main h2, main h3, main h4, main p, main li, main td, main th, main .body-text, main .note, main .metric .value, main .metric strong')];
  }

  function typographyLabelPosition(rect, labelRect, options = {}) {
    const viewportRight = options.viewportRight ?? window.innerWidth - 8;
    const scrollX = options.scrollX ?? window.scrollX;
    const scrollY = options.scrollY ?? window.scrollY;
    const minLeft = options.minLeft ?? 8;
    const minTop = options.minTop ?? 8;
    const gap = options.gap ?? 4;
    const preferredLeft = rect.right + gap + scrollX;
    const maxLeft = viewportRight + scrollX - labelRect.width;
    const left = Math.max(minLeft + scrollX, Math.min(preferredLeft, maxLeft));
    const preferredTop = rect.top - labelRect.height - gap + scrollY;
    const fallbackTop = rect.top + gap + scrollY;
    const top = preferredTop >= minTop + scrollY ? preferredTop : fallbackTop;
    return { left: Math.round(left), top: Math.round(top) };
  }

  function refreshTypographyLabels() {
    if (!isSinglePageMode()) return;
    document.querySelectorAll('.typography-label').forEach(label => label.remove());
    if (!editModeEnabled()) return;
    typographyTargets().forEach(element => {
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const label = document.createElement('span');
      label.className = 'typography-label';
      label.textContent = typographyLevel(element);
      document.body.appendChild(label);
      const labelRect = label.getBoundingClientRect();
      const position = typographyLabelPosition(rect, labelRect, { minLeft: 4, minTop: 4 });
      label.style.left = `${position.left}px`;
      label.style.top = `${position.top}px`;
      element.dataset.typographyLabel = label.textContent;
    });
  }

  function rgbToHex(value) {
    const match = String(value).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (!match) return /^#[0-9a-f]{6}$/i.test(value) ? value : '';
    return `#${match.slice(1, 4).map(part => Number(part).toString(16).padStart(2, '0')).join('')}`;
  }

  function selectElement(element) {
    if (element && !SUPPORTED_TYPES.has(elementType(element))) return;
    if (selectedElement === element) return;
    selectedElement?.classList.remove('selected-element');
    selectedElement = element || null;
    selectedElement?.classList.add('selected-element');
    setDataEditContext(selectedElement && elementType(selectedElement) === 'chart' ? 'chart' : '');
    refreshElementControls();
    if (selectedElement) openDrawerGroupByIntent(elementType(selectedElement) === 'chart' ? 'chart' : 'object');
    document.dispatchEvent(new CustomEvent('html-report-element-selected', { detail: { element: selectedElement } }));
  }

  function recognitionStatus(message, kind = '') {
    const status = document.getElementById('recognitionStatus');
    if (!status) return;
    status.textContent = message;
    status.classList.toggle('is-error', kind === 'error');
    status.classList.toggle('is-ok', kind === 'ok');
  }

  function setRecognitionCandidate(element) {
    recognitionCandidate?.classList.remove('recognition-candidate');
    recognitionCandidate = element || null;
    recognitionCandidate?.classList.add('recognition-candidate');
    const label = document.getElementById('recognitionCandidateLabel');
    if (label) {
      const name = recognitionCandidate
        ? recognitionCandidate.dataset.pptxName || recognitionCandidate.tagName.toLowerCase()
        : '未选择';
      label.textContent = `待识别：${name}`;
    }
  }

  function setRecognitionPickMode(enabled) {
    recognitionPickMode = Boolean(enabled && editModeEnabled());
    document.body.classList.toggle('recognition-pick-mode', recognitionPickMode);
    if (!recognitionPickMode && !editModeEnabled()) setRecognitionCandidate(null);
    const button = document.getElementById('pickRecognitionElement');
    if (button) button.classList.toggle('active', recognitionPickMode);
    if (recognitionPickMode) {
      openDrawerGroupByIntent('recognition');
      recognitionStatus('请点击页面中需要补充识别的主体元素。');
    }
    else recognitionStatus(recognitionCandidate ? '已选择元素，请选择识别类型。' : '编辑模式下可手动补充漏识别元素。');
  }

  function recognitionTargetFromClick(target) {
    if (!(target instanceof Element)) return null;
    if (target.closest('.style-drawer, .drawer-toggle, nav, #nav, #sectionNav, .html-export-choice')) return null;
    const element = target.closest('main *');
    if (!element) return null;
    if (element.matches('.kicker, .foot, .page-number') || element.closest('.foot')) return null;
    return element;
  }

  function markEditableText(element) {
    element.classList.add('editable');
    element.dataset.editableElement = 'text';
    if (editModeEnabled()) element.setAttribute('contenteditable', 'true');
  }

  function markTableEditable(table) {
    table.querySelectorAll('th, td').forEach(cell => {
      cell.classList.add('editable');
      if (editModeEnabled()) cell.setAttribute('contenteditable', 'true');
    });
  }

  function applyRecognitionType(type) {
    if (!editModeEnabled()) {
      recognitionStatus('请先开启编辑模式。', 'error');
      return;
    }
    const candidate = recognitionCandidate || selectedElement;
    if (!candidate) {
      recognitionStatus('请先点击“选择元素”，再点页面中的元素。', 'error');
      return;
    }

    let recognized = candidate;
    if (type === 'text') {
      markEditableText(recognized);
    } else if (type === 'shape') {
      recognized.dataset.editableElement = 'shape';
    } else if (type === 'chart') {
      recognized = candidate.matches('.chart') ? candidate : candidate.querySelector('.chart') || candidate;
      recognized.dataset.editableElement = 'chart';
      recognized.classList.add('chart');
    } else if (type === 'image') {
      recognized = candidate.matches('img') ? candidate : candidate.querySelector('img');
      if (!recognized) {
        recognitionStatus('未找到图片元素，请直接点图片或包含图片的容器。', 'error');
        return;
      }
      recognized.dataset.editableElement = 'image';
    } else if (type === 'table') {
      recognized = candidate.matches('table') ? candidate : candidate.closest('table') || candidate.querySelector('table');
      if (!recognized) {
        recognitionStatus('未找到真实 table。伪表格需要先改成真实表格。', 'error');
        return;
      }
      markTableEditable(recognized);
      window.syncDeckJsonFromDom?.();
      setRecognitionCandidate(null);
      setRecognitionPickMode(false);
      refreshTypographyLabels();
      setDataEditContext('table');
      openDrawerGroupByIntent('table');
      recognitionStatus('表格单元格已设为可编辑。', 'ok');
      return;
    } else {
      recognitionStatus('请选择有效的识别类型。', 'error');
      return;
    }

    window.syncDeckJsonFromDom?.();
    setRecognitionCandidate(null);
    setRecognitionPickMode(false);
    selectElement(recognized);
    openDrawerGroupByIntent(type === 'chart' ? 'chart' : 'object');
    refreshTypographyLabels();
    recognitionStatus('元素已补充识别，可继续修改样式或文字。', 'ok');
  }

  function resizeSelectedChart() {
    if (!selectedElement || elementType(selectedElement) !== 'chart' || !window.echarts) return;
    const chartDom = chartDomFromElement(selectedElement);
    if (!chartDom) return;
    window.echarts.getInstanceByDom(chartDom)?.resize();
  }

  function chartDomFromElement(element) {
    if (!element) return null;
    return element.matches?.('.chart') ? element : element.querySelector?.('.chart');
  }

  function chartInstanceFromElement(element) {
    const chartDom = chartDomFromElement(element);
    if (!chartDom || !window.echarts) return null;
    return window.echarts.getInstanceByDom(chartDom) || null;
  }

  function plainSeriesData(data) {
    return (data || []).map(item => {
      if (item && typeof item === 'object' && 'value' in item) return item.value;
      return item;
    });
  }

  function editablePayloadFromChartOption(option) {
    const xAxis = Array.isArray(option?.xAxis) ? option.xAxis[0] : option?.xAxis;
    const yAxis = Array.isArray(option?.yAxis) ? option.yAxis[0] : option?.yAxis;
    const categoryAxis = yAxis?.data ? 'yAxis' : xAxis?.data ? 'xAxis' : '';
    const categories = categoryAxis === 'yAxis' ? yAxis.data : categoryAxis === 'xAxis' ? xAxis.data : [];
    return {
      categories,
      categoryAxis,
      series: (option?.series || []).map(series => ({
        name: series.name || '',
        type: series.type || '',
        data: plainSeriesData(series.data),
      })),
    };
  }

  function currentChartOption(element) {
    const chart = chartInstanceFromElement(element);
    if (chart) return chart.getOption();
    const stored = chartDomFromElement(element)?.dataset.chartOption;
    if (!stored) return null;
    try {
      return JSON.parse(stored);
    } catch (_error) {
      return null;
    }
  }

  function prettyJsonForEditor(value) {
    if (!value) return '';
    try {
      const parsed = typeof value === 'string' ? JSON.parse(value) : value;
      return JSON.stringify(parsed, null, 2);
    } catch (_error) {
      return String(value);
    }
  }

  function refreshChartDataControls() {
    const editor = document.getElementById('chartDataEditor');
    const status = document.getElementById('chartDataStatus');
    if (!editor || !status) return;
    status.classList.remove('is-error', 'is-ok');
    if (!selectedElement || elementType(selectedElement) !== 'chart') {
      editor.value = '';
      status.textContent = '支持 categories / series，或 { "option": {...} }。';
      return;
    }
    const option = currentChartOption(selectedElement);
    if (!option) {
      editor.value = '';
      status.textContent = '未找到 ECharts 实例。请确认图表已渲染。';
      status.classList.add('is-error');
      return;
    }
    const stored = chartDomFromElement(selectedElement)?.dataset.chartData;
    if (stored) editor.value = prettyJsonForEditor(stored);
    else editor.value = JSON.stringify(editablePayloadFromChartOption(option), null, 2);
    status.textContent = '修改 JSON 后点击“应用图表数据”。';
  }

  function mergedChartOption(baseOption, payload) {
    if (payload && typeof payload === 'object' && payload.option) return payload.option;
    const next = JSON.parse(JSON.stringify(baseOption || {}));
    const categoryAxis = payload.categoryAxis === 'xAxis' || payload.categoryAxis === 'yAxis'
      ? payload.categoryAxis
      : Array.isArray(next.yAxis) && next.yAxis[0]?.data
        ? 'yAxis'
        : 'xAxis';
    if (Array.isArray(payload.categories)) {
      const axes = Array.isArray(next[categoryAxis]) ? next[categoryAxis] : [next[categoryAxis] || {}];
      axes[0] = { ...axes[0], type: axes[0].type || 'category', data: payload.categories };
      next[categoryAxis] = axes;
    }
    if (Array.isArray(payload.series)) {
      const existing = Array.isArray(next.series) ? next.series : [];
      next.series = payload.series.map((series, index) => ({
        ...(existing[index] || {}),
        ...(series.type ? { type: series.type } : {}),
        ...(series.name ? { name: series.name } : {}),
        data: Array.isArray(series.data) ? series.data : Array.isArray(series.values) ? series.values : [],
      }));
    }
    return next;
  }

  function setChartDataStatus(message, kind = '') {
    const status = document.getElementById('chartDataStatus');
    if (!status) return;
    status.textContent = message;
    status.classList.toggle('is-error', kind === 'error');
    status.classList.toggle('is-ok', kind === 'ok');
  }

  function applyChartDataEditor() {
    if (!editModeEnabled() || !selectedElement || elementType(selectedElement) !== 'chart') return;
    const editor = document.getElementById('chartDataEditor');
    const chartDom = chartDomFromElement(selectedElement);
    const chart = chartInstanceFromElement(selectedElement);
    if (!editor || !chartDom || !chart) {
      setChartDataStatus('未找到可编辑的 ECharts 图表。', 'error');
      return;
    }
    let payload;
    try {
      payload = JSON.parse(editor.value);
    } catch (error) {
      setChartDataStatus(`JSON 格式错误：${error.message}`, 'error');
      return;
    }
    const option = mergedChartOption(chart.getOption(), payload);
    chart.setOption(option, true);
    chart.resize();
    const normalizedPayload = payload.option ? editablePayloadFromChartOption(option) : payload;
    const payloadText = JSON.stringify(normalizedPayload, null, 2);
    chartDom.dataset.chartData = payloadText;
    chartDom.dataset.chartOption = JSON.stringify(option);
    editor.value = payloadText;
    window.syncDeckJsonFromDom?.();
    setChartDataStatus('图表数据已应用并保存到页面。', 'ok');
  }

  function applyStoredChartOptions() {
    if (!window.echarts) return;
    document.querySelectorAll('[data-editable-element="chart"].chart[data-chart-option], [data-editable-element="chart"] .chart[data-chart-option]').forEach(chartDom => {
      const chart = window.echarts.getInstanceByDom(chartDom);
      if (!chart) return;
      try {
        chart.setOption(JSON.parse(chartDom.dataset.chartOption), true);
        chart.resize();
      } catch (_error) {
        // Keep the chart's generated option when saved data is invalid.
      }
    });
  }

  function applyElementStyle(input) {
    if (!editModeEnabled() || !selectedElement) return;
    const mapping = STYLE_CONTROLS[input.id];
    if (!mapping) return;
    const [property, unit] = mapping;
    if (input.value === '') return;
    let nextValue = input.value;
    if (property === 'width' || property === 'height') {
      const computed = getComputedStyle(selectedElement);
      if (computed.display === 'inline') selectedElement.style.display = 'inline-block';
      if (property === 'width') {
        if (isSinglePageMode() && elementType(selectedElement) === 'chart') {
          const parentWidth = selectedElement.parentElement?.getBoundingClientRect().width || 0;
          const scaledParentWidth = Math.floor(parentWidth / reportScale());
          const numericValue = parseFloat(input.value);
          if (scaledParentWidth > 0 && Number.isFinite(numericValue)) nextValue = String(Math.min(numericValue, scaledParentWidth));
          selectedElement.style.maxWidth = '100%';
        } else {
          selectedElement.style.maxWidth = 'none';
        }
        const parent = selectedElement.parentElement;
        if (parent) {
          const parentStyle = getComputedStyle(parent);
          const mainAxis = parentStyle.flexDirection.startsWith('column') ? 'height' : 'width';
          if (parentStyle.display.includes('flex') && mainAxis === property) selectedElement.style.flex = `0 0 ${nextValue}${unit}`;
        }
      }
    }
    selectedElement.style.setProperty(property.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`), `${nextValue}${unit}`, 'important');
    resizeSelectedChart();
    refreshElementControls();
    window.dispatchEvent(new Event('resize'));
    document.dispatchEvent(new CustomEvent('html-report-element-style', {
      detail: { element: selectedElement, property, value: selectedElement.style[property] },
    }));
  }

  function bindGlobalControls() {
    document.querySelectorAll('[data-global-var]').forEach(input => {
      if (input.dataset.globalControlInitialized === 'true') return;
      input.addEventListener('input', () => {
        if (!editModeEnabled()) return;
        const unit = input.dataset.unit ?? (input.dataset.globalVar === '--body-line-height' ? '' : 'px');
        document.documentElement.style.setProperty(input.dataset.globalVar, `${input.value}${unit}`);
        document.body.classList.add('global-typography-active');
        const out = document.querySelector(`[data-global-out="${input.dataset.globalVar}"]`);
        if (out) out.textContent = input.value;
        window.dispatchEvent(new Event('resize'));
        refreshTypographyLabels();
      });
      input.dataset.globalControlInitialized = 'true';
    });
    const fontFamily = document.getElementById('fontFamily');
    if (fontFamily?.dataset.globalControlInitialized === 'true') return;
    const applyFontFamily = event => {
      if (!editModeEnabled()) return;
      document.documentElement.style.setProperty('--font-family', event.target.value.replace(/\s*\n\s*/g, ' ').trim());
      document.body.classList.add('global-font-active');
      refreshTypographyLabels();
    };
    fontFamily?.addEventListener('input', applyFontFamily);
    fontFamily?.addEventListener('change', applyFontFamily);
    if (fontFamily) fontFamily.dataset.globalControlInitialized = 'true';
  }

  function buildSectionNav() {
    if (!isSinglePageMode()) return;
    const nav = document.getElementById('sectionNav');
    if (!nav) return;
    nav.textContent = '';
    const sections = [...document.querySelectorAll('.report-section[data-title]')];
    sections.forEach((section, index) => {
      if (!section.id) section.id = `section-${index + 1}`;
      const fullTitle = section.dataset.title || section.id;
      const link = document.createElement('a');
      link.href = `#${section.id}`;
      link.textContent = shortSectionTitle(fullTitle);
      link.title = fullTitle;
      link.dataset.sectionNavLabel = link.textContent;
      link.addEventListener('click', event => {
        event.preventDefault();
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      nav.appendChild(link);
    });
  }

  function setSectionNavStyle(style) {
    if (!isSinglePageMode()) return;
    const nextStyle = ['hidden', 'left', 'right'].includes(style) ? style : 'right';
    document.body.classList.remove('section-nav-hidden', 'section-nav-left', 'section-nav-right');
    document.body.classList.add(`section-nav-${nextStyle}`);
    document.querySelectorAll('[data-section-nav-style]').forEach(button => {
      button.classList.toggle('active', button.dataset.sectionNavStyle === nextStyle);
      button.setAttribute('aria-pressed', String(button.dataset.sectionNavStyle === nextStyle));
    });
    refreshTypographyLabels();
  }

  function refreshSectionNavActiveState() {
    if (!isSinglePageMode()) return;
    const sections = [...document.querySelectorAll('.report-section[data-title]')];
    if (!sections.length) return;
    const current = sections.reduce((active, section) => {
      const offset = section.getBoundingClientRect().top;
      return offset <= 120 ? section : active;
    }, sections[0]);
    document.querySelectorAll('#sectionNav a').forEach(link => {
      link.classList.toggle('active', link.getAttribute('href') === `#${current.id}`);
    });
  }

  function bindSectionNavControls() {
    if (!isSinglePageMode() || sectionNavBound) return;
    document.querySelectorAll('[data-section-nav-style]').forEach(button => {
      button.addEventListener('click', () => setSectionNavStyle(button.dataset.sectionNavStyle));
    });
    window.addEventListener('scroll', refreshSectionNavActiveState, { passive: true });
    window.addEventListener('resize', () => {
      refreshSectionNavActiveState();
      refreshTypographyLabels();
    });
    sectionNavBound = true;
  }

  function bindElementControls() {
    Object.keys(STYLE_CONTROLS).forEach(id => {
      const input = document.getElementById(id);
      if (!input || input.dataset.elementControlInitialized === 'true') return;
      input.addEventListener(input.tagName === 'SELECT' ? 'change' : 'input', () => applyElementStyle(input));
      input.dataset.elementControlInitialized = 'true';
    });
    document.querySelectorAll('[data-color-target]').forEach(input => {
      if (input.dataset.colorHexInitialized === 'true') return;
      const applyHexColor = () => {
        if (!editModeEnabled() || !selectedElement) return;
        const raw = input.value.trim();
        const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(raw);
        if (!match) return;
        const hex = match[1].length === 3
          ? `#${match[1].split('').map(char => char + char).join('')}`
          : `#${match[1]}`;
        const colorInput = document.getElementById(input.dataset.colorTarget);
        if (!colorInput) return;
        colorInput.value = hex;
        input.value = hex.toUpperCase();
        applyElementStyle(colorInput);
      };
      input.addEventListener('input', applyHexColor);
      input.addEventListener('change', applyHexColor);
      input.dataset.colorHexInitialized = 'true';
    });
    bindChartDataControls();
    bindRecognitionControls();
    if (documentClickBound) return;
    document.addEventListener('click', event => {
      if (!editModeEnabled()) return;
      if (recognitionPickMode) {
        const candidate = recognitionTargetFromClick(event.target);
        if (candidate) {
          event.preventDefault();
          event.stopPropagation();
          setRecognitionCandidate(candidate);
          setRecognitionPickMode(false);
          recognitionStatus(candidate.dataset.editableElement ? '该元素已被识别，可重新选择类型覆盖。' : '已选择元素，请选择识别类型。');
        }
        return;
      }
      const target = event.target.closest('[data-editable-element]');
      if (target) {
        selectElement(target);
        return;
      }
      if (!event.target.closest('.style-drawer')) selectElement(null);
    });
    documentClickBound = true;
  }

  function bindRecognitionControls() {
    const pick = document.getElementById('pickRecognitionElement');
    if (pick && pick.dataset.recognitionPickInitialized !== 'true') {
      pick.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        if (!editModeEnabled()) {
          recognitionStatus('请先开启编辑模式。', 'error');
          return;
        }
        setRecognitionPickMode(!recognitionPickMode);
      });
      pick.dataset.recognitionPickInitialized = 'true';
    }
    document.querySelectorAll('[data-recognition-type]').forEach(button => {
      if (button.dataset.recognitionTypeInitialized === 'true') return;
      button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        applyRecognitionType(button.dataset.recognitionType);
      });
      button.dataset.recognitionTypeInitialized = 'true';
    });
  }

  function bindChartDataControls() {
    const button = document.getElementById('applyChartData');
    if (!button || button.dataset.chartDataInitialized === 'true') return;
    button.addEventListener('click', event => {
      event.preventDefault();
      applyChartDataEditor();
    });
    button.dataset.chartDataInitialized = 'true';
  }

  function bindDeleteControl() {
    const button = document.getElementById('deleteSelectedElement');
    if (!button || button.dataset.deleteControlInitialized === 'true') return;
    button.addEventListener('click', () => {
      if (!editModeEnabled() || !selectedElement) return;
      const element = selectedElement;
      if (!window.confirm('确定删除当前元素吗？')) return;
      selectElement(null);
      element.remove();
      window.syncDeckJsonFromDom?.();
      window.dispatchEvent(new Event('resize'));
    });
    button.dataset.deleteControlInitialized = 'true';
  }

  function fileToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  async function inlineStandaloneAssets(clone) {
    for (const link of [...clone.querySelectorAll('link[rel="stylesheet"][href]')]) {
      try {
        const response = await fetch(link.href);
        if (!response.ok) continue;
        const style = clone.ownerDocument.createElement('style');
        style.dataset.inlineAsset = link.getAttribute('href');
        style.textContent = await response.text();
        link.replaceWith(style);
      } catch (_error) {
        // Keep the external stylesheet when the browser cannot inline it.
      }
    }
    for (const script of [...clone.querySelectorAll('script[src]')]) {
      try {
        const response = await fetch(script.src);
        if (!response.ok) continue;
        const inline = clone.ownerDocument.createElement('script');
        inline.dataset.inlineAsset = script.getAttribute('src');
        inline.textContent = await response.text();
        script.replaceWith(inline);
      } catch (_error) {
        // Keep the external script when the browser cannot inline it.
      }
    }
    for (const image of [...clone.querySelectorAll('img[src]')]) {
      if (/^data:/i.test(image.getAttribute('src') || '')) continue;
      try {
        const response = await fetch(image.src);
        if (response.ok) image.src = await fileToDataUrl(await response.blob());
      } catch (_error) {
        // Keep the original source when the browser cannot read it.
      }
    }
  }

  async function downloadStandaloneHtml(preserveEditing = false) {
    selectElement(null);
    const clone = document.documentElement.cloneNode(true);
    clone.querySelectorAll('[contenteditable]').forEach(element => element.removeAttribute('contenteditable'));
    clone.querySelectorAll('.selected-element, .selected-box, .selected-col').forEach(element => {
      element.classList.remove('selected-element', 'selected-box', 'selected-col');
    });
    const body = clone.querySelector('body');
    body?.classList.remove('drawer-open', 'edit-mode');
    body?.classList.remove('export-dialog-open');
    if (!preserveEditing) body?.classList.add('standalone-export');
    const drawer = clone.querySelector('#styleDrawer');
    drawer?.classList.remove('open');
    const toggle = clone.querySelector('#drawerToggle');
    const choice = clone.querySelector('#htmlExportChoice');
    choice?.setAttribute('hidden', '');
    if (!preserveEditing) {
      drawer?.setAttribute('hidden', '');
      if (drawer) drawer.style.display = 'none';
      toggle?.setAttribute('hidden', '');
      if (toggle) toggle.style.display = 'none';
    } else {
      drawer?.removeAttribute('hidden');
      if (drawer) drawer.style.display = '';
      toggle?.removeAttribute('hidden');
      if (toggle) toggle.style.display = '';
    }
    await inlineStandaloneAssets(clone);
    const blob = new Blob(['<!doctype html>\n' + clone.outerHTML], { type: 'text/html;charset=utf-8' });
    const anchor = document.createElement('a');
    anchor.href = URL.createObjectURL(blob);
    anchor.download = 'html-report-single.html';
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  }

  function exportSnapshotHtml() {
    selectElement(null);
    window.syncDeckJsonFromDom?.();
    const clone = document.documentElement.cloneNode(true);
    clone.querySelectorAll('[contenteditable]').forEach(element => element.removeAttribute('contenteditable'));
    clone.querySelectorAll('.selected-element, .selected-box, .selected-col').forEach(element => {
      element.classList.remove('selected-element', 'selected-box', 'selected-col');
    });
    clone.querySelectorAll('.typography-label').forEach(element => element.remove());
    const body = clone.querySelector('body');
    body?.classList.remove('drawer-open', 'edit-mode');
    body?.classList.add('standalone-export');
    const drawer = clone.querySelector('#styleDrawer');
    drawer?.setAttribute('hidden', '');
    const toggle = clone.querySelector('#drawerToggle');
    toggle?.setAttribute('hidden', '');
    return '<!doctype html>\n' + clone.outerHTML;
  }

  function previewServiceAvailable() {
    return location.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(location.hostname);
  }

  async function requestInstantExport(format) {
    if (!previewServiceAvailable()) {
      window.alert('请通过本地预览地址打开报告后再进行高保真导出。');
      return false;
    }
    const buttons = [...document.querySelectorAll(`[data-export-format="${format}"], #printPdf, #exportPpt, #downloadLongPng, #downloadLongPdf`)];
    buttons.forEach(button => { button.disabled = true; });
    try {
      const response = await fetch('/api/export', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode: document.body.dataset.reportMode, format, html: exportSnapshotHtml(), title: document.title || 'html-report' }),
      });
      const result = await response.json();
      if (!response.ok || !result.downloadUrl) throw new Error(result.error || '导出失败。');
      const anchor = document.createElement('a');
      anchor.href = result.downloadUrl;
      anchor.download = result.fileName || '';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      return true;
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '导出失败。');
      return false;
    } finally {
      buttons.forEach(button => { button.disabled = false; });
    }
  }

  function bindLongExportDownloads() {
    ['downloadLongPng', 'downloadLongPdf'].forEach(id => {
      const button = document.getElementById(id);
      if (!button || button.dataset.longExportInitialized === 'true') return;
      button.addEventListener('click', () => requestInstantExport(id === 'downloadLongPng' ? 'png' : 'pdf'));
      button.dataset.longExportInitialized = 'true';
    });
  }

  function init() {
    initAccordionGroups();
    rememberGlobalDefaults();
    initResetButtons();
    bindGlobalControls();
    bindElementControls();
    bindDeleteControl();
    refreshElementControls();
    refreshDataGroupAvailability();
    window.setTimeout(applyStoredChartOptions, 0);
    window.addEventListener('load', applyStoredChartOptions, { once: true });
    if (isSinglePageMode()) {
      buildSectionNav();
      bindSectionNavControls();
      const activeNav = document.body.classList.contains('section-nav-left') ? 'left' : document.body.classList.contains('section-nav-hidden') ? 'hidden' : 'right';
      setSectionNavStyle(activeNav);
      refreshSectionNavActiveState();
      if (!typographyResizeBound) {
        document.addEventListener('input', event => {
          if (event.target.closest('main')) refreshTypographyLabels();
        });
        typographyResizeBound = true;
      }
      const download = document.getElementById('downloadHtml');
      if (download && !document.getElementById('htmlExportChoice')) download.onclick = downloadStandaloneHtml;
      bindLongExportDownloads();
    }
  }

  window.HTMLReportEditor = {
    init,
    initAccordionGroups,
    openAccordionGroup,
    openDrawerGroupByIntent,
    refreshDataGroupAvailability,
    setDataEditContext,
    setRecognitionPickMode,
    applyRecognitionType,
    buildSectionNav,
    setSectionNavStyle,
    shortSectionTitle,
    typographyLevel,
    refreshTypographyLabels,
    selectElement,
    getSelectedElement: () => selectedElement,
    downloadStandaloneHtml,
    exportSnapshotHtml,
    previewServiceAvailable,
    requestInstantExport,
    refreshGlobalControlsFromComputedTypography,
    refreshChartDataControls,
    applyChartDataEditor,
    applyStoredChartOptions,
    typographyLabelPosition,
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
