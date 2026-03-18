// Dungeon Crawler - Entry Point
import { CONFIG, STATE } from './constants.js';

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Game state placeholder
let gameState = STATE.MAIN_MENU;

console.log('Dungeon Crawler initialized');
