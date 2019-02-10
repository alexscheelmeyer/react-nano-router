import React from 'react';
import * as historyModule from 'history';
import pathToRegexp from 'path-to-regexp';
import deepmerge from 'deepmerge';

// HACK (to make it work in both rollup and node-js)
const _history = historyModule.default ? historyModule.default : historyModule;

let history = null;
try {
  history = _history.createBrowserHistory();
} catch(e) {
  history = _history.createMemoryHistory();
}

export function pathMatcher(pathPattern, options) {
  if (options === undefined) options = {};

  const basePath = options.basePath || '';
  const combinedPath = options.absolute ?
    pathPattern :
    `${basePath}${pathPattern}`;

  const { exact = false, strict = false, sensitive = false } = options;

  const keys = [];
  const regexp = pathToRegexp(combinedPath, keys, { end: exact, strict, sensitive });

  return (actualPath) => {
    const match = regexp.exec(actualPath);

    if (match) {
      const [path, ...values] = match;
      const params = {};
      keys.forEach((key, index) => {
        params[key.name] = values[index];
      });

      return { path, params };
    }

    return null;
  }
}

function matches(path, options) {
  const matcher = pathMatcher(path, options);
  return matcher(history.location.pathname);
}

export function pathSelector(location, basePath = '') {
  return (routeMap) =>
    routeMap.find((route) => {
      if (route.path === undefined || route.path === undefined) {
        return true;
      }

      const matcher = pathMatcher(`${basePath}${route.path}`, route);
      return matcher(location);
    });
}

export const UrlContext = React.createContext({});


function makeValue(url, baseValue, basePath) {
  if (basePath === undefined) basePath = '';

  const select = (routeMap) => {
    const activeRoute = pathSelector(url, basePath)(routeMap);
    if (!activeRoute) {
      return '';
    }

    let props = activeRoute.initialProps ? activeRoute.initialProps(url) : {};

    const subValue = makeValue(url, baseValue, `${basePath}${activeRoute.path}`);
    return React.createElement(UrlContext.Provider, { value: subValue }, activeRoute.component(props));
  }

  const matches = (path, options) => {
    if (options === undefined) options = {};
    options.basePath = basePath;
    const matcher = pathMatcher(path, options);
    return matcher(url);
  }

  return deepmerge(baseValue, { select, matches });
}


class UrlProvider extends React.Component {
  constructor(props) {
    super(props);

    this.state = { location: history.location, initial: true };
  }

  componentDidMount() {
    this.unlisten = history.listen((location) =>
      this.setState({ location, initial:false }));
  }

  componentWillUnmount() {
    if (this.unlisten) {
      this.unlisten();
    }
  }

  render() {
    const value = makeValue(history.location.pathname, { history });
    return React.createElement(UrlContext.Provider, { value }, this.props.children);
  }
}


class StaticUrlProvider extends React.Component {
  render() {
    const { url, children, basepath = '' } = this.props;
    const value = makeValue(url, {});
    return React.createElement(UrlContext.Provider, { value }, children);
  }
}

export const $UrlProvider = (...children) =>
  React.createElement(UrlProvider, {}, ...children);
export const $StaticUrlProvider = (props, ...children) =>
  React.createElement(StaticUrlProvider, props, ...children);
export const $UrlConsumer = (renderProp) =>
  React.createElement(UrlContext.Consumer, {}, renderProp);


const $a = (props, ...children) =>
  React.createElement('a', props, ...children);


function isModifiedEvent(event) {
  return !!(event.metaKey || event.altKey || event.ctrlKey || event.shiftKey);
}

export class Link extends React.Component {
  handleClick(event, history) {
    if (this.props.onClick) this.props.onClick(event);

    if (
      !event.defaultPrevented && // onClick prevented default
      event.button === 0 && // ignore everything but left clicks
      (!this.props.target || this.props.target === "_self") && // let browser handle "target=_blank" etc.
      !isModifiedEvent(event) // ignore clicks with modifier keys
    ) {
      event.preventDefault();

      const method = this.props.replace ? history.replace : history.push;

      if (!this.props.noScroll) {
        // when the browser changes page it will reset the scroll position,
        // so scroll window to make it look like you actually changed page
        window.scrollTo(0,0);
      }
      method(this.props.href);
    }
  }
  
  render() {
    const { innerRef, replace, element = $a, href, ...rest } = this.props;

    return $UrlConsumer((context) => {
      let _href = href;
      try {
        const location = _history.createLocation(href, null, null, context.location);
        _href = context.history.createHref(location);
      } catch(e) {
      }

      return element({
        ...rest,
        onClick: (event) => this.handleClick(event, context.history),
        href: _href,
        ref: innerRef
      });
    });
  }
}

export const $Link = (props, ...children) =>
  React.createElement(Link, props, ...children);


export class NavLink extends React.Component {
  render() {
    return $UrlConsumer((context) => {
      const { whenActive, exact, ...otherProps } = this.props;
      const isActive = context.matches(this.props.href, { absolute: true, exact });
      const children = Array.isArray(this.props.children) ?
        this.props.children :
        [this.props.children];
      const props = (isActive && whenActive ) ?
        deepmerge(otherProps, whenActive) :
        otherProps;
      return $Link(props, ...children);
    });
  }
}

export const $NavLink = (props, ...children) =>
  React.createElement(NavLink, props, ...children);


export default {
  pathMatcher,
  pathSelector,
  UrlContext,
  $UrlProvider,
  $StaticUrlProvider,
  $UrlConsumer,
  Link, $Link,
};
