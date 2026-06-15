// ===== CONFIG =====
// Replace these with your Supabase project credentials
const SUPABASE_URL = 'https://gquttnortstqsvaegsxj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdxdXR0bm9ydHN0cXN2YWVnc3hqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0NDMyMTAsImV4cCI6MjA5NzAxOTIxMH0.SgZ1NxeqBfqXg0nZb2c_z4dNUcE8O_3gsKbrLlgBlq0';

let sbClient = null;
let robots = [];
let currentView = 'list';
let editingRobot = null;
let originalRobotState = null;
let changeLogData = [];
let locations = [];
let sortField = null;
let sortAsc = true;

// Default field options
const DEFAULT_STATUSES = ['测试中', '借出中', '返修中', '已出库'];
const DEFAULT_TYPES = ['小hi', 'pi', 'Pi plus V2.0.0', 'Pi plus pro V2.0.0', '一自由度带腰机器人'];
const DEFAULT_PERSONS = [];

// Get custom field options from localStorage or use defaults
function getFieldOptions() {
  const saved = localStorage.getItem('field_options');
  if (saved) {
    try { return JSON.parse(saved); } catch {}
  }
  return { statuses: DEFAULT_STATUSES, types: DEFAULT_TYPES, persons: DEFAULT_PERSONS };
}

function saveFieldOptions(opts) {
  localStorage.setItem('field_options', JSON.stringify(opts));
}

function getStatuses() { return getFieldOptions().statuses; }
function getTypes() {
  const opts = getFieldOptions();
  const dataTypes = [...new Set(robots.map(r => r.type))].sort();
  return [...new Set([...opts.types, ...dataTypes])].sort();
}
function getPersons() {
  const opts = getFieldOptions();
  const dataPersons = extractPersons();
  return [...new Set([...opts.persons, ...dataPersons])].sort();
}
