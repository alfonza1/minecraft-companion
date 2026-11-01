import { renderToString } from 'react-dom/server';
import App from './App';
export { pages } from './content';
export function render(route: string) { return renderToString(<App route={route}/>); }

