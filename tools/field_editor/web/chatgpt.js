const byId = id => document.getElementById(id);
const test = byId('connection-test');
const stop = byId('connection-stop');
const feedback = byId('connection-feedback');
let token;
let status;
let busy = false;

async function request(action, post = false) {
  const response = await fetch('/api/chatgpt/' + action, {
    method: post ? 'POST' : 'GET',
    ...(post ? {body: '{}'} : {}),
    headers: {'Content-Type': 'application/json', 'X-Editor-UI': token || ''},
  });
  if (!response.ok) throw new Error('設定を読み取れません。設計室を起動してからページを開き直してください。');
  return response.json();
}

function render(value) {
  status = value;
  byId('connection-state').textContent = value.enabled
    ? (value.last_contact ? '認証済みのアクセスを確認' : '待受中・アクセス待ち')
    : (value.endpoint ? '停止中' : '未設定');
  byId('connection-state').dataset.enabled = String(value.enabled);
  byId('connection-auth').textContent = value.enabled
    ? (value.last_contact ? 'ローカル認証済み' : 'ローカル認証を設定済み')
    : (value.endpoint ? '受付停止' : '未設定');
  byId('connection-endpoint').textContent = value.endpoint || '未設定';
  byId('connection-tunnel').textContent = value.tunnel_id ||
    (value.endpoint ? '指定なし（HTTPS中継またはローカル確認）' : '未設定');
  byId('connection-tools').textContent = value.endpoint
    ? (value.allow_proposals ? '読み取り・変更案の作成' : '読み取り専用')
    : '—';
  byId('connection-last').textContent = value.last_contact
    ? new Date(value.last_contact).toLocaleString('ja-JP')
    : 'アクセス履歴なし';
  byId('connection-revision').textContent = value.revision;
}

async function update(action = 'status') {
  if (busy) return;
  busy = true;
  test.disabled = stop.disabled = true;
  try {
    if (!token) token = (await request('session')).ui_token;
    const value = await request(action, action !== 'status');
    render(value);
    if (action === 'test') feedback.textContent = value.ok
      ? 'ローカルMCPの認証とrevision取得に成功しました。続けてChatGPTからツールを呼び出してください。'
      : 'ローカルMCPのテストに失敗しました。エディタの起動状態を確認してください。';
    if (action === 'stop') feedback.textContent =
      '新しいMCPリクエストの受付を停止しました。トンネルを終了するには、起動したターミナルで Ctrl+C を押してください。';
  } catch (error) {
    feedback.textContent = error.message;
  } finally {
    busy = false;
    test.disabled = stop.disabled = !status?.enabled;
  }
}

test.addEventListener('click', () => update('test'));
stop.addEventListener('click', () => update('stop'));
update();
setInterval(() => { if (!document.hidden) update(); }, 5000);
