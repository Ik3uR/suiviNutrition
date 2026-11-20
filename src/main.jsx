import { render } from 'preact';
import { App } from './app.jsx';
import './styles.css';

// Demande à iOS de ne jamais effacer les données de l'app.
navigator.storage?.persist?.().catch(() => {});

render(<App />, document.getElementById('app'));
