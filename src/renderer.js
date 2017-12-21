import { remote, shell } from 'electron';
import crypto from 'crypto';
import querystring from 'querystring';
import base64url from 'base64-url';
import axios from 'axios';

import 'babel-polyfill';
import React from 'react';
import ReactDOM from 'react-dom';
import { createStore } from 'redux';
import { Provider, connect } from 'react-redux';

/**
 * Salesforce OAuth2 endpoints
 */
const authzEndpointUrl = 'https://login.salesforce.com/services/oauth2/authorize';
const tokenEndpointUrl = 'https://login.salesforce.com/services/oauth2/token';

// client id can be included in the app. it is NOT secret.
const clientId = '3MVG9A2kN3Bn17hv5Z.MnUUfJRedqHjIOTrCsnDtLbs1KD7bz0wTBM0ess02tdrA8qEppwYNLoxSEugmHNYCZ';
// specify the same redirect URI in the connected app. The port number should be carefully chosen not to conflict to others
const redirectUri = 'http://localhost:33201/oauth2/callback';

// Callout main process functions
const { waitCallback, focusWin } = remote.require('./main');

/**
 * Execute OAuth2 Authz Code Flow and get tokens
 */
async function startAuth() {
  // code verifier value is generated randomly and base64url-encoded
  const verifier = base64url.encode(crypto.randomBytes(32));
  // code challenge value is sha256-hashed value of the verifier, base64url-encoded.
  const challenge = base64url.encode(crypto.createHash('sha256').update(verifier).digest());
  // attach code challenge when requesting to authorization server
  const authzUrl = authzEndpointUrl + '?' + querystring.stringify({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    code_challenge: challenge,
  });
  // open authorization url in OS standard browser
  shell.openExternal(authzUrl);
  // start temporary server in the redirect url. wait for callback from the authorization server
  const { code } = await waitCallback(redirectUri);
  // bring back the focus to this application as it opens OS browser
  focusWin();
  // add code verifier in token request.
  // client secret is not needed. All electron app should be public client.
  const ret = await axios({
    method: 'post',
    url: tokenEndpointUrl,
    headers : {
      "content-type": "application/x-www-form-urlencoded",
    },
    data: querystring.stringify({
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    }),
  });
  return ret.data;
}

/**
 *
 */
const connector = connect(
  (state, props) => ({
    tokens: state.tokens,
    loading: state.loading,
  }),
  (dispatch) => ({
    onLogin: async () => {
      dispatch({ type: 'LOGIN_START' });
      try {
        const tokens = await startAuth();
        dispatch({ type: 'LOGIN_END' });
        dispatch({ type: 'SET_TOKENS', payload: { tokens } });
      } catch(e) {
        console.error(e);
        dispatch({ type: 'LOGIN_END' });
      }
    },
  }),
)

const reducer = (state = {}, action) => {
  switch (action.type) {
    case 'LOGIN_START':
      return Object.assign({}, state, { loading: true });
    case 'LOGIN_END':
      return Object.assign({}, state, { loading: false });
    case 'SET_TOKENS':
      return Object.assign({}, state, { tokens: action.payload.tokens });
  }
  return state;
}

const store = createStore(reducer);

const App = connector(({ loading = false, tokens, onLogin }) => (
  <div>
    {
      tokens ?
      <ul>
        <li>Access Token: <span>{ tokens.access_token }</span></li>
        <li>Refresh Token: <span>{ tokens.refresh_token }</span></li>
        <li>Instance URL: <span>{ tokens.instance_url }</span></li>
      </ul> :
      <button onClick={ loading ? undefined : onLogin } disabled={ loading }>Login</button>
    }
  </div>
));

const Root = () => (
  <Provider store={ store }>
    <App />
  </Provider>
);

ReactDOM.render(<Root />, document.getElementById('root'));
