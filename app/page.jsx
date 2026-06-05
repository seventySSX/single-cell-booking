'use client';

import { useEffect, useMemo, useState } from 'react';

const HOURS = Array.from({ length: 18 }, (_, i) => i + 7); // 7:00 - 24:00，可按需修改

function todayString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDaysString(dateString, days) {
  const date = new Date(`${dateString}T00:00:00`);
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatHour(hour) {
  return `${String(hour).padStart(2, '0')}:00`;
}

function formatDateLabel(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateString;
  return date.toLocaleDateString('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'short'
  });
}

function dateToDayNumber(dateString) {
  const [year, month, day] = dateString.split('-').map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
}

function toSlot(dateString, hour) {
  return dateToDayNumber(dateString) * 24 + Number(hour);
}

function currentSlot() {
  const now = new Date();
  return toSlot(todayString(), now.getHours());
}

function isMultiDay(reservation) {
  return reservation.end_date && reservation.end_date !== reservation.reservation_date;
}

function formatReservationRange(reservation) {
  const endDate = reservation.end_date || reservation.reservation_date;
  if (reservation.reservation_date === endDate) {
    return `${formatHour(reservation.start_hour)} - ${formatHour(reservation.end_hour)}`;
  }
  return `${formatDateLabel(reservation.reservation_date)} ${formatHour(reservation.start_hour)} - ${formatDateLabel(endDate)} ${formatHour(reservation.end_hour)}`;
}

function formatFullReservationRange(reservation) {
  const endDate = reservation.end_date || reservation.reservation_date;
  return `${formatDateLabel(reservation.reservation_date)} ${formatHour(reservation.start_hour)} - ${formatDateLabel(endDate)} ${formatHour(reservation.end_hour)}`;
}

function groupByDate(reservations) {
  return reservations.reduce((acc, item) => {
    if (!acc[item.reservation_date]) acc[item.reservation_date] = [];
    acc[item.reservation_date].push(item);
    return acc;
  }, {});
}

function boolText(value) {
  if (value === true) return '是';
  if (value === false) return '否';
  return '未填写';
}

function hasIssue(reservation) {
  if (!reservation.feedback_submitted_at) return false;
  return reservation.feedback_instrument_ok === false
    || reservation.feedback_backpressure_released === false
    || reservation.feedback_hydrogen_shutdown === false
    || Boolean((reservation.feedback_note || '').trim());
}

function reservationHasEnded(reservation) {
  return toSlot(reservation.end_date || reservation.reservation_date, reservation.end_hour) <= currentSlot();
}

function feedbackStatus(reservation) {
  if (!reservation.feedback_submitted_at) {
    return reservationHasEnded(reservation) ? '未填写反馈' : '待使用后反馈';
  }
  if (hasIssue(reservation)) {
    return reservation.issue_resolved ? '异常已解决' : '异常待处理';
  }
  return '反馈正常';
}

function reservationStatusText(reservation) {
  if (reservation.status === 'canceled') return '已取消';
  const start = toSlot(reservation.reservation_date, reservation.start_hour);
  const end = toSlot(reservation.end_date || reservation.reservation_date, reservation.end_hour);
  const now = currentSlot();
  if (end <= now) return '已结束';
  if (start <= now && end > now) return '进行中';
  return '未开始';
}

function issueReasonText(issue) {
  const reasons = [];
  if (issue.feedback_instrument_ok === false) reasons.push('仪器运行异常');
  if (issue.feedback_backpressure_released === false) reasons.push('背压未确认卸除');
  if (issue.feedback_hydrogen_shutdown === false) reasons.push('氢气发生器未确认关闭/放气');
  if ((issue.feedback_note || '').trim()) reasons.push('填写了异常说明');
  return reasons.join('、');
}

function FeedbackModal({ reservation, feedbackForm, setFeedbackForm, onClose, onSubmit, submitting }) {
  if (!reservation) return null;

  function update(key, value) {
    setFeedbackForm((prev) => ({ ...prev, [key]: value }));
  }

  function yesNoQuestion(key, title) {
    return (
      <div className="feedback-question">
        <p>{title}</p>
        <div className="radio-row">
          <label>
            <input
              type="radio"
              name={key}
              checked={feedbackForm[key] === true}
              onChange={() => update(key, true)}
            />
            是
          </label>
          <label>
            <input
              type="radio"
              name={key}
              checked={feedbackForm[key] === false}
              onChange={() => update(key, false)}
            />
            否
          </label>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card">
        <div className="modal-header">
          <div>
            <p className="eyebrow small-eyebrow">Instrument Feedback</p>
            <h2>仪器使用反馈</h2>
            <p className="modal-subtitle">{reservation.reserver_name}｜{formatFullReservationRange(reservation)}</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose}>×</button>
        </div>

        <form className="feedback-form" onSubmit={onSubmit}>
          {yesNoQuestion('instrumentOk', '使用过程中，仪器运行是否正常？')}
          {yesNoQuestion('backpressureReleased', '背压是否已卸除？（若未加背压则选是）')}
          {yesNoQuestion('hydrogenShutdown', '氢气发生器是否已关闭并放气？')}

          <label>
            异常情况说明，可选
            <textarea
              value={feedbackForm.feedbackNote}
              onChange={(event) => update('feedbackNote', event.target.value)}
              rows={4}
              placeholder="若无异常可以不填写；若有异常，请尽量写清现象、时间和处理情况。"
            />
          </label>

          <div className="modal-actions">
            <button type="button" className="secondary-button" onClick={onClose} disabled={submitting}>稍后填写</button>
            <button type="submit" className="submit-button compact" disabled={submitting}>
              {submitting ? '提交中…' : '提交反馈'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function HomePage() {
  const [selectedDate, setSelectedDate] = useState('');
  const [isReady, setIsReady] = useState(false);
  const [reservations, setReservations] = useState([]);
  const [dayReservations, setDayReservations] = useState([]);
  const [issues, setIssues] = useState([]);
  const [history, setHistory] = useState([]);
  const [retentionDays, setRetentionDays] = useState(365);
  const [historyFilters, setHistoryFilters] = useState({ from: '', to: '', q: '' });
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [cancelingId, setCancelingId] = useState('');
  const [feedbackTarget, setFeedbackTarget] = useState(null);
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [resolvingId, setResolvingId] = useState('');
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({
    reserverName: '',
    contact: '',
    startHour: '9',
    endHour: '10',
    endDate: '',
    purpose: '',
    cancelCode: ''
  });
  const [feedbackForm, setFeedbackForm] = useState({
    instrumentOk: null,
    backpressureReleased: null,
    hydrogenShutdown: null,
    feedbackNote: ''
  });

  async function loadUpcoming() {
    const res = await fetch('/api/reservations', { cache: 'no-store' });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || '读取预约失败');
    setReservations(json.reservations || []);
  }

  async function loadDay(date) {
    const res = await fetch(`/api/reservations?date=${date}`, { cache: 'no-store' });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || '读取当天预约失败');
    setDayReservations(json.reservations || []);
  }

  async function loadIssues() {
    const res = await fetch('/api/reservations?view=issues', { cache: 'no-store' });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || '读取异常反馈失败');
    setIssues(json.issues || []);
  }

  async function loadHistory(filters = historyFilters) {
    if (!filters.from || !filters.to) return;
    setHistoryLoading(true);
    try {
      const params = new URLSearchParams({ view: 'history', from: filters.from, to: filters.to });
      if (filters.q.trim()) params.set('q', filters.q.trim());
      const res = await fetch(`/api/reservations?${params.toString()}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '读取历史预约失败');
      setHistory(json.history || []);
      setRetentionDays(json.retentionDays || 365);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setHistoryLoading(false);
    }
  }

  async function refresh(date = selectedDate) {
    if (!date) return;
    setLoading(true);
    setMessage('');
    try {
      await Promise.all([loadUpcoming(), loadDay(date), loadIssues()]);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const today = todayString();
    const from = addDaysString(today, -90);
    setSelectedDate(today);
    setForm((prev) => ({ ...prev, endDate: today }));
    setHistoryFilters({ from, to: today, q: '' });
    setIsReady(true);
    refresh(today);
    loadHistory({ from, to: today, q: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isReady || !selectedDate) return;
    loadDay(selectedDate).catch((error) => setMessage(error.message));
  }, [selectedDate, isReady]);

  const groupedReservations = useMemo(() => groupByDate(reservations), [reservations]);

  const endHourOptions = useMemo(() => {
    const startHour = Number(form.startHour);
    return HOURS.slice(1).filter((hour) => form.endDate !== selectedDate || hour > startHour);
  }, [form.endDate, form.startHour, selectedDate]);

  useEffect(() => {
    if (endHourOptions.length === 0) return;
    if (!endHourOptions.includes(Number(form.endHour))) {
      setForm((prev) => ({ ...prev, endHour: String(endHourOptions[0]) }));
    }
  }, [endHourOptions, form.endHour]);

  const bookedMap = useMemo(() => {
    const map = new Map();
    for (const reservation of dayReservations) {
      const reservationStart = toSlot(reservation.reservation_date, reservation.start_hour);
      const reservationEnd = toSlot(reservation.end_date || reservation.reservation_date, reservation.end_hour);

      for (const hour of HOURS.slice(0, -1)) {
        const slotStart = toSlot(selectedDate, hour);
        const slotEnd = toSlot(selectedDate, hour + 1);
        if (reservationStart < slotEnd && reservationEnd > slotStart && !map.has(hour)) {
          map.set(hour, reservation);
        }
      }
    }
    return map;
  }, [dayReservations, selectedDate]);

  function updateForm(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function updateHistoryFilter(key, value) {
    setHistoryFilters((prev) => ({ ...prev, [key]: value }));
  }

  function handleStartDateChange(value) {
    setSelectedDate(value);
    setForm((prev) => ({
      ...prev,
      endDate: prev.endDate < value ? value : prev.endDate
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setMessage('');

    try {
      if (!selectedDate || !form.endDate) {
        throw new Error('请选择开始日期和结束日期。');
      }

      const res = await fetch('/api/reservations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          reservationDate: selectedDate,
          endDate: form.endDate,
          startHour: Number(form.startHour),
          endHour: Number(form.endHour)
        })
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '预约失败');

      setMessage('预约成功！请记住你设置的取消密码，之后取消预约时需要使用。');
      setForm((prev) => ({ ...prev, endDate: selectedDate, purpose: '', cancelCode: '' }));
      await refresh(selectedDate);
      await loadHistory();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancel(reservation) {
    const cancelCode = window.prompt(
      `请输入取消密码，确认取消 ${formatFullReservationRange(reservation)} 的预约。`
    );

    if (cancelCode === null) return;
    if (!cancelCode.trim()) {
      setMessage('请输入取消密码后再取消预约。');
      return;
    }

    const confirmed = window.confirm('确认取消这条预约吗？取消后该时间段会重新开放，但历史预约中仍会保留取消记录。');
    if (!confirmed) return;

    setCancelingId(reservation.id);
    setMessage('');

    try {
      const res = await fetch('/api/reservations', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: reservation.id,
          cancelCode,
          reservationDate: reservation.reservation_date,
          endDate: reservation.end_date || reservation.reservation_date,
          startHour: reservation.start_hour,
          endHour: reservation.end_hour,
          reserverName: reservation.reserver_name
        })
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '取消预约失败');

      setMessage('预约已取消，时间段已重新开放；取消记录已保留在历史预约中。');
      await refresh(selectedDate);
      await loadHistory();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setCancelingId('');
    }
  }

  function openFeedback(reservation) {
    setFeedbackTarget(reservation);
    setFeedbackForm({
      instrumentOk: reservation.feedback_submitted_at ? reservation.feedback_instrument_ok : null,
      backpressureReleased: reservation.feedback_submitted_at ? reservation.feedback_backpressure_released : null,
      hydrogenShutdown: reservation.feedback_submitted_at ? reservation.feedback_hydrogen_shutdown : null,
      feedbackNote: reservation.feedback_note || ''
    });
  }

  async function handleFeedbackSubmit(event) {
    event.preventDefault();
    if (!feedbackTarget) return;

    setFeedbackSubmitting(true);
    setMessage('');

    try {
      if (typeof feedbackForm.instrumentOk !== 'boolean'
        || typeof feedbackForm.backpressureReleased !== 'boolean'
        || typeof feedbackForm.hydrogenShutdown !== 'boolean') {
        throw new Error('请完整回答三个仪器状态问题。');
      }

      const res = await fetch('/api/reservations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'feedback',
          id: feedbackTarget.id,
          instrumentOk: feedbackForm.instrumentOk,
          backpressureReleased: feedbackForm.backpressureReleased,
          hydrogenShutdown: feedbackForm.hydrogenShutdown,
          feedbackNote: feedbackForm.feedbackNote
        })
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '提交反馈失败');

      setFeedbackTarget(null);
      setMessage(json.issueDetected
        ? '反馈已提交。系统检测到异常信息，已在首页顶部显示提醒。'
        : '反馈已提交，仪器状态记录为正常。');
      await refresh(selectedDate);
      await loadHistory();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setFeedbackSubmitting(false);
    }
  }

  async function handleResolveIssue(issue) {
    const resolveCode = window.prompt('请输入管理员处理密码，确认异常情况已解决。');
    if (resolveCode === null) return;
    if (!resolveCode.trim()) {
      setMessage('请输入管理员处理密码后再关闭异常提示。');
      return;
    }

    const confirmed = window.confirm('确认该异常情况已经解决，并关闭首页提醒吗？');
    if (!confirmed) return;

    setResolvingId(issue.id);
    setMessage('');

    try {
      const res = await fetch('/api/reservations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'resolveIssue', id: issue.id, resolveCode })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '关闭异常提示失败');
      setMessage('异常提示已关闭，记录仍可在历史预约中查询。');
      await refresh(selectedDate);
      await loadHistory();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setResolvingId('');
    }
  }

  function renderFeedbackBadge(item) {
    const status = feedbackStatus(item);
    let className = 'status-badge neutral';
    if (status === '反馈正常') className = 'status-badge ok';
    if (status === '异常待处理') className = 'status-badge danger';
    if (status === '异常已解决') className = 'status-badge warning';
    if (status === '未填写反馈') className = 'status-badge missing';
    return <span className={className}>{status}</span>;
  }

  return (
    <main className="page-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Single Cell Station Booking</p>
          <h1>单电池仪器预约平台</h1>
          <p className="hero-text">
            选择日期与小时段提交预约。短时间测试只需选择同一天；多日占用时可把结束日期改为后续日期。测试结束后，请在对应预约中提交仪器使用反馈。
          </p>
        </div>
        <button className="refresh-button" onClick={() => refresh()} disabled={loading}>
          {loading ? '刷新中…' : '刷新预约'}
        </button>
      </section>

      {issues.length > 0 && (
        <section className="issue-banner">
          <div className="issue-banner-header">
            <div>
              <p className="eyebrow small-eyebrow">Attention</p>
              <h2>仪器异常反馈待处理</h2>
              <p>以下反馈含有“否”或异常说明。请确认仪器状态后再安排后续测试。</p>
            </div>
            <strong>{issues.length} 条</strong>
          </div>
          <div className="issue-list">
            {issues.map((issue) => (
              <article className="issue-item" key={issue.id}>
                <div>
                  <strong>{issue.reserver_name}｜{formatFullReservationRange(issue)}</strong>
                  <p>{issueReasonText(issue)}</p>
                  {issue.feedback_note && <blockquote>{issue.feedback_note}</blockquote>}
                </div>
                <button
                  type="button"
                  className="resolve-button"
                  onClick={() => handleResolveIssue(issue)}
                  disabled={resolvingId === issue.id}
                >
                  {resolvingId === issue.id ? '处理中…' : '情况已解决'}
                </button>
              </article>
            ))}
          </div>
        </section>
      )}

      {message && <div className={message.includes('成功') || message.includes('已取消') || message.includes('已提交') || message.includes('已关闭') ? 'notice success' : 'notice'}>{message}</div>}

      <section className="grid-layout">
        <div className="card booking-card">
          <div className="card-header">
            <h2>新建预约</h2>
            <span>{selectedDate ? formatDateLabel(selectedDate) : '正在读取日期…'}</span>
          </div>

          <form onSubmit={handleSubmit} className="booking-form">
            <div className="two-columns">
              <label>
                开始日期
                <input
                  type="date"
                  value={selectedDate}
                  min={todayString()}
                  onChange={(event) => handleStartDateChange(event.target.value)}
                  required
                />
              </label>

              <label>
                结束日期
                <input
                  type="date"
                  value={form.endDate}
                  min={selectedDate || undefined}
                  onChange={(event) => updateForm('endDate', event.target.value)}
                  required
                />
              </label>
            </div>

            <div className="two-columns">
              <label>
                开始时间
                <select value={form.startHour} onChange={(event) => updateForm('startHour', event.target.value)}>
                  {HOURS.slice(0, -1).map((hour) => (
                    <option key={hour} value={hour}>{formatHour(hour)}</option>
                  ))}
                </select>
              </label>

              <label>
                结束时间
                <select value={form.endHour} onChange={(event) => updateForm('endHour', event.target.value)}>
                  {endHourOptions.map((hour) => (
                    <option key={hour} value={hour}>{formatHour(hour)}</option>
                  ))}
                </select>
              </label>
            </div>

            <p className="form-note">
              多日预约示例：开始日期选择 6 月 10 日 09:00，结束日期选择 6 月 13 日 09:00，即表示连续占用 3 天。
            </p>

            <label>
              预约人
              <input
                value={form.reserverName}
                onChange={(event) => updateForm('reserverName', event.target.value)}
                placeholder="例如：许博星"
                required
              />
            </label>

            <label>
              联系方式，可选
              <input
                value={form.contact}
                onChange={(event) => updateForm('contact', event.target.value)}
                placeholder="例如：微信 / 手机 / 邮箱"
              />
            </label>

            <label>
              取消密码
              <input
                type="password"
                value={form.cancelCode}
                onChange={(event) => updateForm('cancelCode', event.target.value)}
                placeholder="至少 4 位；之后取消预约时使用"
                minLength={4}
                required
              />
              <small className="field-hint">系统不会在首页显示取消密码，请预约人自行记住。</small>
            </label>

            <label>
              用途，可选
              <textarea
                value={form.purpose}
                onChange={(event) => updateForm('purpose', event.target.value)}
                placeholder="例如：稳定性测试；样品编号 OPBI-PDA-1"
                rows={3}
              />
            </label>

            <button className="submit-button" type="submit" disabled={submitting}>
              {submitting ? '提交中…' : isReady ? '提交预约' : '正在初始化…'}
            </button>
          </form>
        </div>

        <div className="card timeline-card">
          <div className="card-header">
            <h2>当天时间段</h2>
            <span>{dayReservations.length} 条预约</span>
          </div>

          <div className="timeline">
            {HOURS.slice(0, -1).map((hour) => {
              const reservation = bookedMap.get(hour);
              return (
                <div className={reservation ? 'slot booked' : 'slot free'} key={hour}>
                  <div className="slot-time">{formatHour(hour)} - {formatHour(hour + 1)}</div>
                  <div className="slot-content">
                    {reservation ? (
                      <>
                        <strong>{reservation.reserver_name}</strong>
                        <span>{reservation.purpose || '已预约'}</span>
                        {isMultiDay(reservation) && <small className="long-badge">多日预约：{formatReservationRange(reservation)}</small>}
                      </>
                    ) : (
                      <span>可预约</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="card upcoming-card">
        <div className="card-header">
          <h2>首页预约总览</h2>
          <span>未来 60 天</span>
        </div>

        {loading ? (
          <p className="empty">正在读取预约信息…</p>
        ) : reservations.length === 0 ? (
          <p className="empty">目前还没有预约。</p>
        ) : (
          <div className="reservation-list">
            {Object.entries(groupedReservations).map(([date, items]) => (
              <div className="date-group" key={date}>
                <h3>{formatDateLabel(date)}</h3>
                <div className="reservation-items">
                  {items.map((item) => (
                    <article className={isMultiDay(item) ? 'reservation-item long-reservation' : 'reservation-item'} key={item.id}>
                      <div className="reservation-main">
                        <strong>{formatReservationRange(item)}</strong>
                        <div className="badge-row">
                          {isMultiDay(item) && <span className="long-label">多日预约</span>}
                          {renderFeedbackBadge(item)}
                        </div>
                        <p>{item.purpose || '未填写用途'}</p>
                      </div>
                      <div className="person">
                        <span>{item.reserver_name}</span>
                        {item.contact && <small>{item.contact}</small>}
                        <div className="action-row vertical">
                          <button
                            type="button"
                            className="feedback-button"
                            onClick={() => openFeedback(item)}
                          >
                            {item.feedback_submitted_at ? '修改反馈' : '填写反馈'}
                          </button>
                          <button
                            type="button"
                            className="cancel-button"
                            onClick={() => handleCancel(item)}
                            disabled={cancelingId === item.id}
                          >
                            {cancelingId === item.id ? '取消中…' : '取消预约'}
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card history-card">
        <div className="card-header history-header">
          <div>
            <h2>历史预约查询</h2>
            <p>可用于追溯仪器使用记录。已结束但未提交反馈的预约会标记为“未填写反馈”。</p>
          </div>
          <span>自动保留约 {retentionDays} 天</span>
        </div>

        <div className="history-controls">
          <label>
            开始日期
            <input type="date" value={historyFilters.from} onChange={(event) => updateHistoryFilter('from', event.target.value)} />
          </label>
          <label>
            结束日期
            <input type="date" value={historyFilters.to} onChange={(event) => updateHistoryFilter('to', event.target.value)} />
          </label>
          <label>
            关键词，可选
            <input
              value={historyFilters.q}
              onChange={(event) => updateHistoryFilter('q', event.target.value)}
              placeholder="预约人 / 用途 / 联系方式 / 异常说明"
            />
          </label>
          <button type="button" className="submit-button compact" onClick={() => loadHistory()} disabled={historyLoading}>
            {historyLoading ? '查询中…' : '查询历史'}
          </button>
        </div>

        {history.length === 0 ? (
          <p className="empty history-empty">当前条件下没有历史记录。</p>
        ) : (
          <div className="history-list">
            {history.map((item) => (
              <article className="history-item" key={item.id}>
                <div>
                  <strong>{formatFullReservationRange(item)}</strong>
                  <p>{item.reserver_name}｜{item.purpose || '未填写用途'}</p>
                  {item.feedback_submitted_at && (
                    <small>
                      反馈：仪器正常 {boolText(item.feedback_instrument_ok)}；背压已卸除 {boolText(item.feedback_backpressure_released)}；氢气发生器已关闭并放气 {boolText(item.feedback_hydrogen_shutdown)}
                    </small>
                  )}
                  {item.feedback_note && <blockquote>{item.feedback_note}</blockquote>}
                </div>
                <div className="history-status">
                  <span className={item.status === 'canceled' ? 'status-badge canceled' : 'status-badge neutral'}>{reservationStatusText(item)}</span>
                  {renderFeedbackBadge(item)}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <footer className="site-footer">
        <p>© 2026 兰州大学化学化工学院宫琛亮课题组. All Rights Reserved.</p>
        <p>本平台仅限兰州大学化学化工学院宫琛亮课题组内部用于单电池仪器预约与信息同步。</p>
        <p>页面内容、程序代码与预约数据未经授权不得复制、传播或用于商业用途。</p>
        <p>技术维护：许博星｜知识产权与管理单位：兰州大学化学化工学院宫琛亮课题组</p>
      </footer>

      <FeedbackModal
        reservation={feedbackTarget}
        feedbackForm={feedbackForm}
        setFeedbackForm={setFeedbackForm}
        onClose={() => setFeedbackTarget(null)}
        onSubmit={handleFeedbackSubmit}
        submitting={feedbackSubmitting}
      />
    </main>
  );
}
