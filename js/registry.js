'use strict';
// Widget registry — must load before render.js, settings.js, cmdpalette.js, and all widget files
const REG = {};
function reg(def) { REG[def.type] = def; }

// Widget catalog — defines which widgets appear in the marketplace and command palette
const CATALOG = [
  {type:'clock',   cat:'basic'},
  {type:'link',    cat:'basic'},
  {type:'notes',   cat:'basic'},
  {type:'weather', cat:'info'},
  {type:'gtrend',  cat:'info'},
  {type:'todo',    cat:'pro'},
  {type:'pomodoro',cat:'pro'},
  {type:'embed',   cat:'pro'},
];
const CAT_COLOR = {basic:'#6af5c8', info:'#f5a66a', pro:'#7c6af5'};
