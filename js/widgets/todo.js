reg({ type:'todo', get name(){return t('w_todo');}, get desc(){return t('w_todo_d');}, icon:'📅', cat:'pro',
  render(body, cfg, id) {

    /* ══════════════════════════════════════════
       TASK STORE  —  keyed by date YYYY-MM-DD
       Shared across all calendar widget instances
       via localStorage key 'cal_tasks_v1'
       ══════════════════════════════════════════ */
    const STORE_KEY = 'cal_tasks_v1';

    function loadTasks() {
      try { return JSON.parse(localStorage.getItem(STORE_KEY)) || []; }
      catch(_) { return []; }
    }
    function saveTasks(arr) {
      try { localStorage.setItem(STORE_KEY, JSON.stringify(arr)); } catch(_) {}
    }
    // P4: genId() is now a global helper in HELPERS section; local definition removed.

    /* Returns tasks for a specific YYYY-MM-DD (O(n) but list is tiny) */
    function tasksForDate(all, dateStr) {
      return all.filter(t => t.date === dateStr);
    }
    /* Today as YYYY-MM-DD */
    function todayStr() {
      const d = new Date();
      return d.getFullYear() + '-' +
             String(d.getMonth()+1).padStart(2,'0') + '-' +
             String(d.getDate()).padStart(2,'0');
    }
    function fmtDate(y,m,d) {
      return y + '-' + String(m).padStart(2,'0') + '-' + String(d).padStart(2,'0');
    }
    /* Monday-start week array for a given Date */
    function weekDays(anchor) {
      const d = new Date(anchor);
      const dow = (d.getDay() + 6) % 7; // 0=Mon
      d.setDate(d.getDate() - dow);
      return Array.from({length:7}, (_,i) => {
        const dd = new Date(d); dd.setDate(d.getDate() + i); return dd;
      });
    }

    /* ══════════════════════════════════════════
       STATE
       ══════════════════════════════════════════ */
    let view   = 'month';           // 'month' | 'week'
    let cursor = new Date();        // drives both month and week nav
    cursor.setDate(1);              // always 1st for month nav

    /* ══════════════════════════════════════════
       SHELL (built once)
       ══════════════════════════════════════════ */
    const shell = document.createElement('div');
    shell.className = 'cal-shell';

    /* sub-header */
    const subhd = document.createElement('div');
    subhd.className = 'cal-subhd';

    const navDiv = document.createElement('div');
    navDiv.className = 'cal-nav';
    const btnPrev = document.createElement('button');
    btnPrev.className = 'cal-nav-btn'; btnPrev.textContent = '‹';
    const monthLbl = document.createElement('span');
    monthLbl.className = 'cal-month-label';
    const btnNext = document.createElement('button');
    btnNext.className = 'cal-nav-btn'; btnNext.textContent = '›';
    navDiv.append(btnPrev, monthLbl, btnNext);

    const viewDiv = document.createElement('div');
    viewDiv.className = 'cal-view-btns';
    const btnMonth = document.createElement('button');
    btnMonth.className = 'cal-view-btn active';
    btnMonth.textContent = t('cal_month');
    const btnWeek = document.createElement('button');
    btnWeek.className = 'cal-view-btn';
    btnWeek.textContent = t('cal_week');
    viewDiv.append(btnMonth, btnWeek);

    subhd.append(navDiv, viewDiv);

    /* content area (swapped on view change) */
    const content_area = document.createElement('div');
    content_area.style.cssText = 'flex:1;overflow:hidden;display:flex;flex-direction:column;';

    shell.append(subhd, content_area);
    body.appendChild(shell);

    /* ══════════════════════════════════════════
       MONTH VIEW
       ══════════════════════════════════════════ */
    let _lastMonthKey = '', _lastWeekKey = '';

    function renderMonth() {
      const all = loadTasks();
      const y = cursor.getFullYear(), m = cursor.getMonth();
      const key = `${y}-${m}-${JSON.stringify(all)}`;
      if (key === _lastMonthKey) return;
      _lastMonthKey = key; _lastWeekKey = '';
      content_area.innerHTML = '';
      const td   = todayStr();

      /* header label */
      const MONTHS = lang==='zh'
        ? ['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月']
        : ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      monthLbl.textContent = MONTHS[m] + ' ' + y;

      const grid = document.createElement('div');
      grid.className = 'cal-month-grid';

      /* Day-of-week headers (Mon … Sun) */
      const DOWS = lang==='zh'
        ? ['一','二','三','四','五','六','日']
        : ['Mo','Tu','We','Th','Fr','Sa','Su'];
      DOWS.forEach(d => {
        const h = document.createElement('div');
        h.className = 'cal-dow'; h.textContent = d;
        grid.appendChild(h);
      });

      /* Build grid: find Monday before the 1st */
      const first = new Date(y, m, 1);
      const startDow = (first.getDay() + 6) % 7; // 0=Mon
      const daysInMonth = new Date(y, m+1, 0).getDate();
      const daysInPrev  = new Date(y, m,   0).getDate();
      const total = Math.ceil((startDow + daysInMonth) / 7) * 7;

      /* Pre-aggregate task counts for THIS month only */
      const countMap = {};
      const mStr = y + '-' + String(m+1).padStart(2,'0') + '-';
      all.forEach(tk => {
        if (tk.date && tk.date.startsWith(mStr)) {
          countMap[tk.date] = (countMap[tk.date] || 0) + 1;
        }
      });

      for (let i = 0; i < total; i++) {
        const dayEl = document.createElement('div');
        dayEl.className = 'cal-day';

        let dayNum, dateStr, isOther = false;
        if (i < startDow) {
          dayNum  = daysInPrev - startDow + i + 1;
          dateStr = fmtDate(m===0?y-1:y, m===0?12:m, dayNum);
          isOther = true;
        } else if (i < startDow + daysInMonth) {
          dayNum  = i - startDow + 1;
          dateStr = fmtDate(y, m+1, dayNum);
        } else {
          dayNum  = i - startDow - daysInMonth + 1;
          dateStr = fmtDate(m===11?y+1:y, m===11?1:m+2, dayNum);
          isOther = true;
        }

        if (isOther)        dayEl.classList.add('other-month');
        if (dateStr===td)   dayEl.classList.add('today');

        const numEl = document.createElement('div');
        numEl.className = 'cal-day-num';
        numEl.textContent = dayNum;
        dayEl.appendChild(numEl);

        const cnt = countMap[dateStr] || 0;
        if (cnt > 0) {
          dayEl.classList.add('has-tasks');
          const dotsEl = document.createElement('div');
          dotsEl.className = 'cal-day-dots';
          const show = Math.min(cnt, 4);
          for (let d = 0; d < show; d++) {
            const dot = document.createElement('div');
            dot.className = 'cal-dot';
            dotsEl.appendChild(dot);
          }
          dayEl.appendChild(dotsEl);
        }

        /* click → open day modal (only if not a widget-drag) */
        let _dayDownX = 0, _dayDownY = 0;
        dayEl.addEventListener('mousedown', e => {
          _dayDownX = e.clientX; _dayDownY = e.clientY;
        });
        dayEl.addEventListener('click', e => {
          const w = body.closest('.widget');
          if (w && w._wasDragged) return;
          const dist = Math.sqrt(Math.pow(e.clientX - _dayDownX, 2) + Math.pow(e.clientY - _dayDownY, 2));
          if (dist >= 6) return;
          openDayModal(dateStr);
        });
        grid.appendChild(dayEl);
      }
      content_area.appendChild(grid);
    }

    /* ══════════════════════════════════════════
       WEEK VIEW
       ══════════════════════════════════════════ */
    function renderWeek() {
      const all = loadTasks();
      const td  = todayStr();
      const weekStart = new Date(cursor); weekStart.setDate(cursor.getDate() - cursor.getDay());
      const key = `${weekStart.toDateString()}-${JSON.stringify(all)}`;
      if (key === _lastWeekKey) return;
      _lastWeekKey = key; _lastMonthKey = '';
      content_area.innerHTML = '';
      const days = weekDays(cursor);

      const MONTHS_SHORT = lang==='zh'
        ? ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月']
        : ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      const DOWS = lang==='zh'
        ? ['一','二','三','四','五','六','日']
        : ['Mo','Tu','We','Th','Fr','Sa','Su'];

      /* Update nav label */
      const ws = days[0], we = days[6];
      monthLbl.textContent = MONTHS_SHORT[ws.getMonth()] + ' ' + ws.getDate() +
        ' – ' + MONTHS_SHORT[we.getMonth()] + ' ' + we.getDate();

      const grid = document.createElement('div');
      grid.className = 'cal-week-grid';

      days.forEach((day, di) => {
        const dateStr = fmtDate(day.getFullYear(), day.getMonth()+1, day.getDate());
        const isToday = dateStr === td;
        const dayTasks = tasksForDate(all, dateStr);

        const col = document.createElement('div');
        col.className = 'cal-week-col' + (isToday ? ' today-col' : '');
        col.dataset.date = dateStr;

        /* header */
        const hd = document.createElement('div');
        hd.className = 'cal-week-hd';
        const dowEl = document.createElement('div');
        dowEl.className = 'cal-week-dow';
        dowEl.textContent = DOWS[di];
        const dnEl = document.createElement('div');
        dnEl.className = 'cal-week-dn';
        dnEl.textContent = day.getDate();
        hd.append(dowEl, dnEl);

        /* task list */
        const taskList = document.createElement('div');
        taskList.className = 'cal-week-tasks';

        dayTasks.forEach(tk => {
          taskList.appendChild(makeTaskEl(tk, dateStr, grid));
        });

        /* inline add row */
        const addRow = document.createElement('div');
        addRow.className = 'cal-add-row';
        const addInp = document.createElement('input');
        addInp.className = 'cal-add-input';
        addInp.placeholder = '+';
        addInp.setAttribute('aria-label', t('cal_add_ph'));
        const addBtn = document.createElement('button');
        addBtn.className = 'cal-add-btn'; addBtn.textContent = '+';

        const doAdd = () => {
          const title = addInp.value.trim();
          if (!title) {
            // BUGFIX: if input is empty, open the day modal for this date
            openDayModal(dateStr);
            return;
          }
          const tasks = loadTasks();
          tasks.push({ id: genId(), title, date: dateStr, completed: false });
          saveTasks(tasks);
          addInp.value = '';
          renderWeek();
        };
        // BUGFIX: stop mousedown on entire add row so widget drag system ignores it
        addRow.addEventListener('mousedown', e => e.stopPropagation());
        addBtn.addEventListener('click', e => { e.stopPropagation(); doAdd(); });
        addInp.addEventListener('keydown', e => { if (e.key==='Enter') { e.stopPropagation(); doAdd(); } });
        addInp.addEventListener('click', e => e.stopPropagation());
        addRow.append(addInp, addBtn);

        col.append(hd, taskList, addRow);

        /* ── drag-and-drop: drop target ── */
        col.addEventListener('dragover', e => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          document.querySelectorAll('.cal-week-col').forEach(c => c.classList.remove('drop-target'));
          col.classList.add('drop-target');
        });
        col.addEventListener('dragleave', e => {
          if (!col.contains(e.relatedTarget)) col.classList.remove('drop-target');
        });
        col.addEventListener('drop', e => {
          e.preventDefault();
          col.classList.remove('drop-target');
          const taskId = e.dataTransfer.getData('text/plain');
          if (!taskId) return;
          const tasks = loadTasks();
          const tk = tasks.find(t => t.id === taskId);
          if (tk && tk.date !== dateStr) {
            tk.date = dateStr;
            saveTasks(tasks);
            renderWeek();
          }
        });

        grid.appendChild(col);
      });
      content_area.appendChild(grid);
    }

    /* ── single task element for week view ── */
    function makeTaskEl(tk, dateStr, gridEl) {
      const el = document.createElement('div');
      el.className = 'cal-task-item' + (tk.completed ? ' completed' : '');
      el.draggable = true;

      const cb = document.createElement('input');
      cb.type = 'checkbox'; cb.className = 'cal-task-cb';
      cb.checked = tk.completed;
      cb.addEventListener('change', e => {
        e.stopPropagation();
        const tasks = loadTasks();
        const found = tasks.find(t => t.id === tk.id);
        if (found) { found.completed = cb.checked; saveTasks(tasks); }
        el.classList.toggle('completed', cb.checked);
        if (cb.checked) toast(t('cal_task_done'), 'ok');
      });

      const titleEl = document.createElement('span');
      titleEl.className = 'cal-task-title';
      titleEl.textContent = tk.title;

      el.append(cb, titleEl);

      /* drag source */
      el.addEventListener('dragstart', e => {
        e.dataTransfer.setData('text/plain', tk.id);
        e.dataTransfer.effectAllowed = 'move';
        el.classList.add('dragging');
      });
      el.addEventListener('dragend', () => {
        el.classList.remove('dragging');
        document.querySelectorAll('.cal-week-col').forEach(c => c.classList.remove('drop-target'));
      });
      /* prevent drag starting a widget-drag */
      el.addEventListener('mousedown', e => e.stopPropagation());

      return el;
    }

    /* ══════════════════════════════════════════
       DAY MODAL  (used by both views)
       ══════════════════════════════════════════ */
    function openDayModal(dateStr) {
      const existing = document.getElementById('cal-day-modal');
      if (existing) existing.remove();

      const isToday = dateStr === todayStr();
      const [y,m,d] = dateStr.split('-').map(Number);
      const MONTHS_FULL = lang==='zh'
        ? ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月']
        : ['January','February','March','April','May','June',
           'July','August','September','October','November','December'];

      const ov = document.createElement('div');
      ov.id = 'cal-day-modal'; ov.className = 'cal-modal-ov';

      const modal = document.createElement('div');
      modal.className = 'cal-modal';

      /* header */
      const mhd = document.createElement('div');
      mhd.className = 'cal-modal-hd';
      const titleWrap = document.createElement('div');
      const titleEl = document.createElement('div');
      titleEl.className = 'cal-modal-title';
      titleEl.textContent = isToday
        ? (lang==='zh' ? '今天' : 'Today')
        : (lang==='zh' ? (m+'月'+d+'日') : MONTHS_FULL[m-1] + ' ' + d);
      const dateEl = document.createElement('div');
      dateEl.className = 'cal-modal-date';
      dateEl.textContent = isToday
        ? (lang==='zh' ? (m+'月'+d+'日') : MONTHS_FULL[m-1]+' '+d+', '+y)
        : y + '';
      titleWrap.append(titleEl, dateEl);
      const closeBtn = document.createElement('button');
      closeBtn.className = 'cal-modal-close'; closeBtn.textContent = '×';
      mhd.append(titleWrap, closeBtn);

      /* body: task list */
      const mbody = document.createElement('div');
      mbody.className = 'cal-modal-body';

      const renderModalTasks = () => {
        mbody.innerHTML = '';
        const tasks = tasksForDate(loadTasks(), dateStr);
        if (tasks.length === 0) {
          const emp = document.createElement('div');
          emp.className = 'cal-modal-empty';
          emp.textContent = t('cal_no_tasks');
          mbody.appendChild(emp);
          return;
        }
        tasks.forEach(tk => {
          const row = document.createElement('div');
          row.className = 'cal-modal-task' + (tk.completed ? ' done' : '');

          const cb = document.createElement('input');
          cb.type = 'checkbox'; cb.className = 'cal-modal-task-cb';
          cb.checked = tk.completed;
          cb.addEventListener('change', () => {
            const all = loadTasks();
            const found = all.find(t => t.id === tk.id);
            if (found) { found.completed = cb.checked; saveTasks(all); }
            row.classList.toggle('done', cb.checked);
            if (cb.checked) toast(t('cal_task_done'), 'ok');
          });

          const titleIn = document.createElement('input');
          titleIn.type = 'text'; titleIn.className = 'cal-modal-task-title';
          titleIn.value = tk.title;
          titleIn.addEventListener('focus', () => titleIn.style.cursor = 'text');
          titleIn.addEventListener('blur', () => {
            const all = loadTasks();
            const found = all.find(t => t.id === tk.id);
            if (found && titleIn.value.trim()) {
              found.title = titleIn.value.trim(); saveTasks(all);
            }
          });
          titleIn.addEventListener('keydown', e => { if (e.key==='Enter') titleIn.blur(); });

          const delBtn = document.createElement('button');
          delBtn.className = 'cal-modal-del'; delBtn.textContent = '×';
          delBtn.addEventListener('click', () => {
            const all = loadTasks().filter(t => t.id !== tk.id);
            saveTasks(all);
            renderModalTasks();
            /* re-render calendar behind the modal */
            view === 'month' ? renderMonth() : renderWeek();
          });

          row.append(cb, titleIn, delBtn);
          mbody.appendChild(row);
        });
      };
      renderModalTasks();

      /* footer: add task */
      const mft = document.createElement('div');
      mft.className = 'cal-modal-ft';
      const addRow = document.createElement('div');
      addRow.className = 'cal-modal-add';
      const addInp = document.createElement('input');
      addInp.type = 'text'; addInp.className = 'cal-modal-input';
      addInp.placeholder = t('cal_add_ph');
      const addBtn = document.createElement('button');
      addBtn.className = 'cal-modal-add-btn';
      addBtn.textContent = t('cal_add_btn');

      const doAdd = () => {
        const title = addInp.value.trim();
        if (!title) return;
        const all = loadTasks();
        all.push({ id: genId(), title, date: dateStr, completed: false });
        saveTasks(all);
        addInp.value = '';
        renderModalTasks();
        view === 'month' ? renderMonth() : renderWeek();
      };
      addBtn.addEventListener('click', doAdd);
      addInp.addEventListener('keydown', e => { if (e.key==='Enter') doAdd(); });
      addRow.append(addInp, addBtn);
      mft.appendChild(addRow);

      modal.append(mhd, mbody, mft);
      ov.appendChild(modal);
      document.body.appendChild(ov);

      /* close handlers */
      closeBtn.addEventListener('click', () => ov.remove());
      ov.addEventListener('click', e => { if (e.target===ov) ov.remove(); });
      document.addEventListener('keydown', function esc(e) {
        if (e.key==='Escape') { ov.remove(); document.removeEventListener('keydown',esc); }
      });

      /* focus add input */
      setTimeout(() => addInp.focus(), 80);
    }

    /* ══════════════════════════════════════════
       NAV / VIEW CONTROLS
       ══════════════════════════════════════════ */
    btnPrev.addEventListener('click', e => {
      e.stopPropagation();
      if (view==='month') { cursor.setMonth(cursor.getMonth()-1); renderMonth(); }
      else { cursor.setDate(cursor.getDate()-7); renderWeek(); }
    });
    btnNext.addEventListener('click', e => {
      e.stopPropagation();
      if (view==='month') { cursor.setMonth(cursor.getMonth()+1); renderMonth(); }
      else { cursor.setDate(cursor.getDate()+7); renderWeek(); }
    });
    btnMonth.addEventListener('click', e => {
      e.stopPropagation();
      if (view==='month') return;
      view='month'; btnMonth.classList.add('active'); btnWeek.classList.remove('active');
      /* cursor back to 1st of the week's month */
      cursor.setDate(1);
      renderMonth();
    });
    btnWeek.addEventListener('click', e => {
      e.stopPropagation();
      if (view==='week') return;
      view='week'; btnWeek.classList.add('active'); btnMonth.classList.remove('active');
      /* cursor = today for first week view */
      cursor = new Date();
      renderWeek();
    });

    /* Widget click (not on button) → open today modal (only if not a widget-drag) */
    body.closest('.widget')?.addEventListener('click', e => {
      const w = body.closest('.widget');
      if (w && w._wasDragged) return;
      // BUGFIX: include .cal-add-row so the + row never falls through to today modal
      const inside = e.target.closest('.cal-nav-btn, .cal-view-btn, .cal-day, .cal-week-col, .cal-add-row, .cal-add-input, .cal-add-btn, .cal-task-item, .cal-task-cb');
      if (!inside) openDayModal(todayStr());
    });

    /* ── initial render ── */
    renderMonth();
  }
});


