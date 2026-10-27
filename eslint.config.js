import globals from 'globals';

// The extension uses classic scripts, not ES modules: every file shares one
// global lexical environment, so cross-file names are intentionally global.
// This list is generated from top-level declarations; regenerate it if you add
// a new global helper.
const shared = Object.fromEntries(`activeCat _orderMigrated clampSize computeDenseLayout itemHeight wPx _activePanel addWidget _appliedBg applyBackground _applyBackgroundNow applyBackgroundNow applyBgPalette applyI18n applyMonetHue applyTheme ASPECT_LOCK attachAutoScale BG_DEFAULTS _bgRAF _bootVc buildEmojiPicker buildEngSwitcher buildGridBg buildPaletteFromColor cancelLongPress CATALOG CAT_COLOR CELL_TARGET _cityCache clamp cleanupWidget clearBgPalette closeAllPanels closeCmd closeCtxMenu closeEngSwitcher closeMkt _closePanel closeSettings collides COLS_MAX _commitTheme compact confirm2 createQuickLink _ctxWidgetId curEng _currentTransition cw cx debounce debouncedSaveState _defaultState DEF_SETTINGS DEF_WIDGETS DEN DOWS_EN DOWS_ZH DZH editMode ENGINES ENG_ORDER engSwitcherOpen enterEditMode enterPureMode esc exitEditMode exitPureMode extractPaletteFromDataUrl _faviconReadyHosts _faviconWaiters _fetchTrendingData _fetchWeatherData findFreeSlot flushSave GAP genId getCmds getCollisions _getWeatherPosition _gridBgCols _gtrendCache _gtrendPromise gw _hasActiveSecondSubs _hslToHex I18N initCmdPalette initEditMode initLinkModal initPanels initPureMode initSearch initTopClock _kmeans lang _lastGeom _lastSecond _lastStateJson _lastThemeHint _lin linkCb linkCustomEmoji linkCustomImg linkEmoji LINK_EMOJIS _loadBgFile _loadFavicon loadState LP_DUR lpTimer _lum makeLocalCache makeWidget MO_EN MONET_HUES NO_DRAG_SELECTOR normalizeToVc normalizeUrl onSecond openCmd openCtxMenu openEngSwitcher openMkt openPanel openSettings OUTER_PAD PANEL_BG _parseTrending positionAll _positionRAF _previewIconKey _previewImgVersion _pureHideTimer pureMode pushDown px2col px2row readGeom reg REG registerCleanup registerTimer removeWidget renderAll renderCmd renderMarket renderSettings renderWidget resizeImageFile resizeTimer _rgbToHsl _rippleBusy rowH _runRippleTransition ry _savedBg _savedImgs saveState _saveThemeHint saveWCfg scheduleReflow _scheduleSecond _secondSubs _secondTimer selCmd setEng setLang setWidgetTickersSuspended showEmbedModal showLinkModal SIZE_RULES _slimState startLongPress state STORAGE_VERSION _syncImgPreviewUI t _themeHintJson _tickSecond tidyLayout _timeoutSignal toast TREND_LANG_ALIAS _trendLangClass TREND_PER_PAGE triggerBgPaletteExtraction updateEmptyHint updateLinkPreview updateLinkPreviewSoon visibleCols WD_EN WD_ZH _weatherCache _weatherFetchKey _weatherFetchPromise _weatherPos _weatherPosPromise _widgetCleanups _widgetTickersSuspended _widgetTimers WMO wPxResponsive`
  .split(/\s+/).filter(Boolean).map(name => [name, 'writable']));

export default [
  { ignores: ['dist/**', 'node_modules/**', 'screenshots/**', '.perf-out/**'] },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      'no-undef': 'error',
      'no-dupe-keys': 'error',
      'no-unreachable': 'error',
      'no-constant-condition': 'error',
    },
  },
  {
    files: ['js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: { ...globals.browser, ...shared },
    },
    rules: {
      'no-undef': 'error',
      'no-dupe-keys': 'error',
      'no-unreachable': 'error',
      'no-constant-condition': 'error',
      'no-fallthrough': 'error',
    },
  },
];
