import { render, emptyState, icon } from '../ui.js';
export default function notfound() {
  render(`<div class="card pad" style="margin-top:40px">${emptyState('Page not found', 'Try the search bar or head back to the dashboard.', 'search')}
    <div style="text-align:center;margin-top:14px"><a class="btn primary" href="#/">${icon('home',16)} Dashboard</a></div></div>`);
}
