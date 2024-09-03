import Framework7 from 'framework7/bundle';

// Import F7 Styles
import 'framework7/css/bundle';

// Import Icons and App Custom Styles
import '../css/icons.css';
import '../css/app.css';



// Import main app component
import App from '../app.f7';
import Guide from '../pages/guide.f7'
console.log(Guide)
var app = new Framework7({
  routes: [
  {
    path: '/guide',
    component: Guide,
    name: 'guide',
    el: '#app', // App root element

  },],
  name: 'Orbit Send', // App name
  theme: 'md', // Material design theme
  colors: {
    primary: '#00ffc3',
  },
  el: '#app', // App root element
  component: App, // App main component
});