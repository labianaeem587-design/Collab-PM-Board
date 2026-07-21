const STORAGE_KEY = 'pm_tasks_v1';
const USER_KEY = 'pm_user_v1';
let currentUser = null;
let tasks = [];
let editingTaskId = null;
let timerInterval = null;
let timerSeconds = 0;

// 1. AUTH - LocalStorage
document.getElementById('loginBtn').onclick = () => {
  const name = document.getElementById('username').value.trim();
  const role = document.getElementById('role').value;
  if(!name) return alert("Enter username");
  currentUser = {name, role, lastActive: Date.now()};
  localStorage.setItem(USER_KEY, JSON.stringify(currentUser));
  showApp();
}
document.getElementById('logoutBtn').onclick = () => {
  pauseTimer(); // auto stop timer on logout
  localStorage.removeItem(USER_KEY);
  location.reload();
}
function showApp(){
  document.getElementById('login').style.display='none';
  document.getElementById('app').style.display='block';
  document.getElementById('userInfo').innerText = `${currentUser.name} - ${currentUser.role}`;
  loadTasks();
  updateAssigneeFilter();
  if(currentUser.role === 'Viewer') document.getElementById('addTaskBtn').style.display='none';
}

// 2. DATA - LocalStorage + Fake Realtime
function loadTasks(){
  tasks = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  renderBoard();
  drawBurndown();
  updateStats();
  simulateRealtime();
}
function saveTasks(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  loadTasks();
}

// 3. KANBAN + BUTTONS FOR MOVING - DRAG DROP HATA DIYA
function renderBoard(){
  const columns = ['Todo', 'In Progress', 'Review', 'Done'];
  document.querySelectorAll('.dropzone').forEach(zone=>{
    const col = zone.parentElement.dataset.col;
    const currentIndex = columns.indexOf(col);
    zone.innerHTML = '';

    tasks.filter(t=>t.status===col).forEach(task=>{
      if(!matchFilters(task)) return;
      const card = document.createElement('div');
      card.className='card';
      card.dataset.id = task.id;

      let buttons = '';
      // Editor aur Owner move kar sakte hain
      if(currentUser.role!== 'Viewer'){
        if(currentIndex > 0)
          buttons += `<button onclick="moveTask('${task.id}', '${columns[currentIndex-1]}')"><< Prev</button>`;
        if(currentIndex < columns.length - 1)
          buttons += `<button onclick="moveTask('${task.id}', '${columns[currentIndex+1]}')">Next >></button>`;
      }
      // Sirf Owner delete kar sakta hai
      if(currentUser.role === 'Owner'){
        buttons += `<button class="danger" onclick="deleteTask('${task.id}')">X</button>`;
      }

      card.innerHTML = `
        <b>${task.title}</b> <span class="badge">${task.priority}</span><br>
        <small>Assignee: ${task.assignee || 'None'}</small><br>
        <small>Progress: ${task.progress || 0}%</small><br>
        <small>Time: ${formatTime(task.timeSpent || 0)}</small>
        <div class="card-actions">
          ${currentUser.role!=='Viewer'?`<button onclick="openModal('${task.id}')">Edit</button>`:''}
          ${buttons}
        </div>
      `;
      zone.appendChild(card);
    });
    zone.parentElement.querySelector('.count').innerText = tasks.filter(t=>t.status===col).length;
  });
}

// NAYA FUNCTION: BUTTON SE MOVE
function moveTask(id, newStatus){
  if(currentUser.role==='Viewer') return;
  updateTask(id, {status: newStatus});
}

// 4. MODAL + TASK CRUD
function openModal(id=null){
  if(currentUser.role==='Viewer') return;
  editingTaskId = id;
  document.getElementById('taskModal').style.display='flex';
  if(id){
    const t = tasks.find(x=>x.id===id);
    document.getElementById('modalTitle').innerText='Edit Task';
    document.getElementById('taskTitle').value=t.title;
    document.getElementById('taskDesc').value=t.description;
    document.getElementById('taskPriority').value=t.priority;
    document.getElementById('taskDue').value=t.dueDate;
    document.getElementById('taskAssignee').value=t.assignee;
    renderSubtasks(t.subtasks || []);
    updateProgress(t.subtasks || []);
    timerSeconds = t.timeSpent || 0;
    document.getElementById('timer').innerText = formatTime(timerSeconds);
    document.getElementById('liveIndicator').innerText = t.editingBy && t.editingBy!==currentUser.name? `${t.editingBy} is editing...` : '';
  } else {
    document.getElementById('modalTitle').innerText='New Task';
    document.querySelectorAll('#taskModal input, #taskModal textarea').forEach(i=>i.value='');
    document.getElementById('subtasks').innerHTML='';
    timerSeconds=0;
  }
}
function closeModal(){
  if(editingTaskId) updateTask(editingTaskId, {editingBy: null});
  document.getElementById('taskModal').style.display='none';
  editingTaskId=null;
  pauseTimer();
}
function saveTask(){
  const data = {
    title: taskTitle.value, description: taskDesc.value, priority: taskPriority.value,
    dueDate: taskDue.value, assignee: taskAssignee.value,
    subtasks: getSubtasks(), progress: calcProgress(getSubtasks()),
    timeSpent: timerSeconds, lastEditedBy: currentUser.name, lastEditedAt: Date.now()
  };
  if(editingTaskId) updateTask(editingTaskId, data);
  else {
    tasks.push({id: Date.now().toString(), status:'Todo', createdBy: currentUser.name, createdAt: Date.now(),...data});
  }
  saveTasks(); closeModal();
}
function updateTask(id, data){
  tasks = tasks.map(t=>t.id===id?{...t,...data}:t);
  saveTasks();
}
function deleteTask(id){ if(confirm('Delete?')){ tasks=tasks.filter(t=>t.id!==id); saveTasks(); } }

// 5. SUBTASKS + PROGRESS
function addSubtask(){
  const div = document.createElement('div'); div.className='subtask';
  div.innerHTML=`<input placeholder="Subtask"><input type="checkbox" onchange="updateProgress(getSubtasks())"><button onclick="this.parentElement.remove()">X</button>`;
  subtasks.appendChild(div);
}
function getSubtasks(){ return [...subtasks.children].map(d=>({text:d.children[0].value, done:d.children[1].checked})) }
function renderSubtasks(list){ subtasks.innerHTML=''; list.forEach(s=>{addSubtask(); const last=subtasks.lastChild; last.children[0].value=s.text; last.children[1].checked=s.done;}) }
function calcProgress(list){ if(!list.length) return 0; return Math.round(list.filter(s=>s.done).length/list.length*100) }
function updateProgress(list){ progress.innerText = calcProgress(list)+'%' }

// 6. TIMER
function startTimer(){ if(timerInterval) return; timerInterval=setInterval(()=>{timerSeconds++; timer.innerText=formatTime(timerSeconds)},1000) }
function pauseTimer(){ clearInterval(timerInterval); timerInterval=null; if(editingTaskId) updateTask(editingTaskId,{timeSpent:timerSeconds}) }
function formatTime(s){ return new Date(s*1000).toISOString().substr(11,8) }

// 7. FILTERS + SEARCH + DEBOUNCE
let searchTimeout;
function debounceSearch(){ clearTimeout(searchTimeout); searchTimeout=setTimeout(applyFilters,300) }
function applyFilters(){ loadTasks() }
function matchFilters(t){
  const q = search.value.toLowerCase();
  const p = filterPriority.value;
  const a = filterAssignee.value;
  const overdue = t.dueDate && new Date(t.dueDate) < new Date() && t.status!=='Done';
  return (!q || t.title.toLowerCase().includes(q)) && (!p || t.priority===p) && (!a || t.assignee===a);
}
function updateAssigneeFilter(){
  const users = [...new Set(tasks.map(t=>t.assignee).filter(Boolean))];
  filterAssignee.innerHTML = '<option value="">All Users</option>' + users.map(u=>`<option>${u}</option>`).join('');
}

// 8. ANALYTICS + REAL BURNDOWN CANVAS
function updateStats(){
  const today = new Date().toDateString();
  const doneToday = tasks.filter(t=>t.status==='Done' && new Date(t.lastEditedAt).toDateString()===today).length;
  const inProgress = tasks.filter(t=>t.status==='In Progress').length;
  const overdue = tasks.filter(t=>t.dueDate && new Date(t.dueDate) < new Date() && t.status!=='Done').length;

  stats.innerHTML = `
    Total: ${tasks.length} |
    Done: ${tasks.filter(t=>t.status==='Done').length} |
    In Progress: ${inProgress} |
    Done Today: ${doneToday} |
    Overdue: ${overdue}
  `;
}

function drawBurndown(){
  const ctx = burndown.getContext('2d');
  ctx.clearRect(0,0,burndown.width,burndown.height);

  const total = tasks.length || 1; // divide by 0 se bachne ke liye
  const todo = tasks.filter(t=>t.status==='Todo').length;
  const inProg = tasks.filter(t=>t.status==='In Progress').length;
  const review = tasks.filter(t=>t.status==='Review').length;
  const done = tasks.filter(t=>t.status==='Done').length;

  // Bar Chart
  const data = [todo, inProg, review, done];
  const labels = ['Todo','InProg','Review','Done'];
  const colors = ['#ec4899','#3b82f6','#f59e0b','#22c55e'];

  const barWidth = burndown.width / data.length - 20;
  data.forEach((val, i) => {
    const barHeight = (val / total) * (burndown.height - 40);
    ctx.fillStyle = colors[i];
    ctx.fillRect(i * (barWidth + 20) + 10, burndown.height - barHeight - 20, barWidth, barHeight);
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text');
    ctx.font = '10px sans-serif';
    ctx.fillText(labels[i], i * (barWidth + 20) + 10, burndown.height - 5);
    ctx.fillText(val, i * (barWidth + 20) + 10, burndown.height - barHeight - 25);
  });
}

// 9. FAKE REALTIME + EDIT LOCK
function simulateRealtime(){
  setInterval(()=>{
    tasks = tasks.map(t=>{
      if(t.editingBy && Date.now()-t.lastEditedAt > 5000) t.editingBy=null;
      return t;
    });
    if(editingTaskId) updateTask(editingTaskId,{editingBy:currentUser.name, lastEditedAt:Date.now()});
  },2000);
}

// 10. THEME + SYSTEM PREF
function setTheme(theme){ document.documentElement.setAttribute('data-theme', theme); localStorage.setItem('theme', theme); }
const savedTheme = localStorage.getItem('theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches? 'dark' : 'light');
setTheme(savedTheme);

// 11. INIT
window.onload = () => {
  const saved = localStorage.getItem(USER_KEY);
  if(saved){ currentUser=JSON.parse(saved); showApp(); }
}
