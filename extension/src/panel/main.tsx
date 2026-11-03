import { render } from 'preact';
import { App } from './App';
import './styles.css';

const root = document.querySelector<HTMLElement>('#app');
if (!root) {
  throw new Error('Side panel root element #app is missing');
}

render(<App />, root);
