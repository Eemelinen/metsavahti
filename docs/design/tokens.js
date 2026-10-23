// Metsävahti design tokens — drop into tailwind.config.js `theme.extend`
// Usage: const { colors, spacing, borderRadius, fontFamily, fontSize } = require('./tokens')
const colors = {
  forest: { 50:'#E9F0EB', 100:'#D3E1D8', 200:'#A9C4B3', 300:'#7EA58F', 500:'#3B7A5A', 600:'#2B6247', 700:'#1E4A37', 800:'#163828', 900:'#0F2A1E' },
  sage:   { 300:'#B7C4BC', 500:'#8A9E93', 700:'#5C6B62' },
  amber:  { 100:'#FBEBD0', 300:'#F0B35A', 500:'#D98A1E', 700:'#9C6010' },
  ember:  { 100:'#FBDDD2', 500:'#D9572B', 700:'#A33E1A' },
  ink:    { DEFAULT:'#1B211D', muted:'#5C6B62', faint:'#8A9E93' },
  paper:  { DEFAULT:'#F7F5F0', raised:'#FFFFFF', sunken:'#EFECE5' },
  line:   { DEFAULT:'#DDE3DE', strong:'#B7C4BC' },
  cut:    { harvennus:'#F0B35A', uudistus:'#D9572B', muu:'#9AA39D' },
  success:'#2B6247', error:'#B8321C', info:'#2F5F8A',
};
const spacing = { 1:'4px', 2:'8px', 3:'12px', 4:'16px', 5:'20px', 6:'24px', 8:'32px', 10:'40px', 12:'48px', 16:'64px', 20:'80px', 24:'96px' };
const borderRadius = { sm:'6px', DEFAULT:'10px', lg:'14px', xl:'20px', full:'9999px' };
const fontFamily = { sans:['Figtree','system-ui','sans-serif'] };
const fontSize = {
  xs:['12px',{lineHeight:'16px'}], sm:['14px',{lineHeight:'20px'}], base:['16px',{lineHeight:'24px'}],
  lg:['18px',{lineHeight:'28px'}], xl:['22px',{lineHeight:'30px'}], '2xl':['28px',{lineHeight:'34px',letterSpacing:'-0.01em'}],
  '3xl':['36px',{lineHeight:'42px',letterSpacing:'-0.015em'}], '4xl':['48px',{lineHeight:'54px',letterSpacing:'-0.02em'}],
};
const boxShadow = { card:'0 1px 2px rgba(27,33,29,0.06), 0 4px 16px rgba(27,33,29,0.06)', pop:'0 8px 32px rgba(27,33,29,0.16)' };
const tokens = { colors, spacing, borderRadius, fontFamily, fontSize, boxShadow };
if (typeof module !== 'undefined') module.exports = tokens;
if (typeof window !== 'undefined') window.MV_TOKENS = tokens;
