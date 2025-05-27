/* @refresh reload */
import { render } from 'solid-js/web';

import * as navigation from '~/globals/navigation';
import { configureRouter } from '~/lib/navigation/router';

import './styles/app.css';

import routes from './routes';
import Shell from './shell';

configureRouter({
	history: navigation.history,
	logger: navigation.logger,
	routes: routes,
});

const App = () => {
	return <Shell />;
};

if (Symbol.dispose === undefined) {
	Object.defineProperty(Symbol, 'dispose', { value: Symbol.for(`Symbol.dispose`) });
}
if (Symbol.asyncDispose === undefined) {
	Object.defineProperty(Symbol, 'asyncDispose', { value: Symbol.for(`Symbol.asyncDispose`) });
}

render(App, document.body);
