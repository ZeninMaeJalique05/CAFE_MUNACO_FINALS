import { useState } from 'react'
import { api } from '../services/api.js'
import { useAuth } from '../auth.jsx'
import { ErrorBox, PageHeader } from '../components/ui.jsx'
import { ROLE_LABEL } from '../utils.js'

export default function Profile() {
  const { user, setUser } = useAuth()
  const [name, setName] = useState(user.full_name)
  const [nameMsg, setNameMsg] = useState({ ok: '', err: '' })
  const [pw, setPw] = useState({
    current_password: '',
    new_password: '',
    confirm: '',
  })
  const [pwMsg, setPwMsg] = useState({ ok: '', err: '' })

  async function saveName(event) {
    event.preventDefault()
    setNameMsg({ ok: '', err: '' })

    try {
      const data = await api('/auth/profile', {
        method: 'PUT',
        body: { full_name: name },
      })
      setUser(data.user)
      setNameMsg({ ok: 'Name saved.', err: '' })
    } catch (error) {
      setNameMsg({ ok: '', err: error.message })
    }
  }

  async function savePassword(event) {
    event.preventDefault()
    setPwMsg({ ok: '', err: '' })

    if (pw.new_password !== pw.confirm) {
      setPwMsg({ ok: '', err: 'The new passwords do not match.' })
      return
    }

    try {
      await api('/auth/password', {
        method: 'PUT',
        body: {
          current_password: pw.current_password,
          new_password: pw.new_password,
        },
      })
      setPw({ current_password: '', new_password: '', confirm: '' })
      setPwMsg({ ok: 'Password changed.', err: '' })
    } catch (error) {
      setPwMsg({ ok: '', err: error.message })
    }
  }

  return (
    <>
      <PageHeader
        title="My Profile"
        subtitle={`${ROLE_LABEL[user.role]} · signed in as ${user.username}`}
      />

      <div className="grid-2">
        <form className="panel form" onSubmit={saveName}>
          <h2>Your details</h2>
          <ErrorBox message={nameMsg.err} />
          {nameMsg.ok && <div className="alert alert-ok">{nameMsg.ok}</div>}

          <label>
            Full name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>

          <label>
            Username
            <input value={user.username} disabled />
          </label>

          <button className="btn btn-primary">Save name</button>
        </form>

        <form className="panel form" onSubmit={savePassword}>
          <h2>Change password</h2>
          <ErrorBox message={pwMsg.err} />
          {pwMsg.ok && <div className="alert alert-ok">{pwMsg.ok}</div>}

          <label>
            Current password
            <input
              type="password"
              value={pw.current_password}
              onChange={(event) =>
                setPw({ ...pw, current_password: event.target.value })
              }
              autoComplete="current-password"
            />
          </label>

          <label>
            New password
            <input
              type="password"
              value={pw.new_password}
              onChange={(event) =>
                setPw({ ...pw, new_password: event.target.value })
              }
              autoComplete="new-password"
            />
          </label>

          <label>
            Confirm new password
            <input
              type="password"
              value={pw.confirm}
              onChange={(event) =>
                setPw({ ...pw, confirm: event.target.value })
              }
              autoComplete="new-password"
            />
          </label>

          <button className="btn btn-primary">Change password</button>
        </form>
      </div>
    </>
  )
}