import { render, icon } from '../ui.js';
export default function notfound() {
  render(`<div class="page-head"><h1>${icon('search', 24)} Page not found</h1>
      <div class="sub">Try the search bar or head back to the dashboard.</div></div>
    <div style="margin-top:14px"><a class="btn primary" href="/">${icon('home',16)} Dashboard</a></div>`);
}
