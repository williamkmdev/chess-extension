import './styles.css';

const app = document.querySelector<HTMLElement>('#app');
if (!app) {
  throw new Error('Side panel root element #app is missing');
}

const heading = document.createElement('h1');
heading.textContent = 'Chess Position Explorer';

const status = document.createElement('p');
status.textContent = 'Position editor and engine analysis are coming in the next steps.';

app.replaceChildren(heading, status);
