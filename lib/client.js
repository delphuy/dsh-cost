/**
 * dsh-cost-badge browser half — mounts a compact balance label into the
 * sidebar footer action row (right beside the Settings button). The label
 * shows the DeepSeek account balance by default; hovering reveals a popover
 * with balance, today's spend and total token usage. Data comes from the
 * host's '/api/cost/state' endpoint, polled every 30 s.
 * @module dsh-cost/client
 */
window.__ModuleLoader__.load({
	id: "dsh-cost",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		const { createElement: h, useState, useEffect } = require('react');

		/** Client services the badge needs (just the slot system). */
		exports.inject = ['slots'];

		/** Format a money amount with a currency prefix; '--' when unknown. */
		function formatMoney(value, currency) {
			if (value === null || value === undefined || Number.isNaN(value)) return '--'
			const prefix = currency === 'CNY' ? '\u00a5' : (currency ? currency + ' ' : '')
			return prefix + Number(value).toFixed(2)
		}

		/** Compact token count (e.g. 1.2M / 3.4k). */
		function formatTokens(n) {
			if (!n) return '0'
			if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M'
			if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k'
			return String(n)
		}

		/** Fetch the cost state from the host. */
		async function fetchState() {
			const res = await fetch('/api/cost/state')
			if (!res.ok) throw new Error('cost HTTP ' + res.status)
			return res.json()
		}

		/** Relative time since `at` (ms), e.g. "3分钟前". */
		function relativeTime(at) {
			if (!at) return ''
			const sec = Math.floor((Date.now() - at) / 1000)
			if (sec < 60) return '刚刚'
			if (sec < 3600) return Math.floor(sec / 60) + '分钟前'
			if (sec < 86400) return Math.floor(sec / 3600) + '小时前'
			return Math.floor(sec / 86400) + '天前'
		}

		/** The badge component rendered inside the sidebar footer action slot. */
		function CostBadge() {
			const [state, setState] = useState(null)
			const [hover, setHover] = useState(false)
			const [error, setError] = useState(null)

			useEffect(() => {
				let alive = true
				const load = () => {
					fetchState().then((s) => { if (alive) { setState(s); setError(null) } }, (e) => { if (alive) setError(String(e.message || e)) })
				}
				load()
				const timer = window.setInterval(load, 30_000)
				return () => { alive = false; window.clearInterval(timer) }
			}, [])

			const balance = state ? state.balance : null
			const currency = state ? state.balanceCurrency : 'CNY'

			const labelStyle = {
				display: 'flex',
				alignItems: 'center',
				gap: '4px',
				padding: '4px 8px',
				fontSize: '12px',
				lineHeight: '1',
				cursor: 'default',
				color: 'var(--dsh-color-text-secondary, var(--ds-text-2, #888))',
				whiteSpace: 'nowrap',
				userSelect: 'none',
				borderRadius: '4px',
			}

			const dotStyle = {
				width: '6px',
				height: '6px',
				borderRadius: '50%',
				background: state && state.balanceError ? '#f59e0b' : '#10b981',
				flexShrink: '0',
			}

			const popoverStyle = {
				position: 'absolute',
				bottom: '100%',
				left: '0',
				marginBottom: '6px',
				background: 'var(--dsh-color-bg-elevated, var(--ds-bg-2, #fff))',
				border: '1px solid var(--dsh-color-border, var(--ds-border, #e5e7eb))',
				borderRadius: '8px',
				padding: '10px 12px',
				fontSize: '12px',
				lineHeight: '1.7',
				boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
				whiteSpace: 'nowrap',
				zIndex: '9999',
				color: 'var(--dsh-color-text-primary, var(--ds-text-1, #222))',
				minWidth: '180px',
			}

			const rowStyle = { display: 'flex', justifyContent: 'space-between', gap: '16px' }
			const mutedStyle = { color: 'var(--dsh-color-text-tertiary, var(--ds-text-3, #999))' }
			const valueStyle = { fontVariantNumeric: 'tabular-nums', fontWeight: '500' }

			return h('div',
				{
					style: { position: 'relative' },
					onMouseEnter: () => setHover(true),
					onMouseLeave: () => setHover(false),
				},
				h('div', { style: labelStyle, title: state && state.balanceError ? '余额接口异常：' + state.balanceError : '费用' },
					h('span', { style: dotStyle }),
					h('span', null, formatMoney(balance, currency)),
				),
				hover && state
					? h('div', { style: popoverStyle },
							h('div', { style: { fontWeight: '600', marginBottom: '4px' } }, '费用'),
							h('div', { style: rowStyle },
								h('span', { style: mutedStyle }, '余额'),
								h('span', { style: valueStyle }, formatMoney(state.balance, state.balanceCurrency)),
							),
							h('div', { style: rowStyle },
								h('span', { style: mutedStyle }, '今日消耗'),
								h('span', { style: valueStyle }, formatMoney(state.todaySpend, state.balanceCurrency)),
							),
							h('div', { style: { height: '1px', background: 'var(--dsh-color-border, var(--ds-border, #eee))', margin: '6px 0' } }),
							h('div', { style: rowStyle },
								h('span', { style: mutedStyle }, '总用量'),
								h('span', { style: valueStyle }, formatTokens((state.totals?.inputTokens || 0) + (state.totals?.outputTokens || 0)) + ' tokens'),
							),
							h('div', { style: rowStyle },
								h('span', { style: mutedStyle }, '　输入 / 输出'),
								h('span', { style: mutedStyle }, formatTokens(state.totals?.inputTokens || 0) + ' / ' + formatTokens(state.totals?.outputTokens || 0)),
							),
							state.totals?.cacheReadTokens || state.totals?.cacheWriteTokens
								? h('div', { style: rowStyle },
										h('span', { style: mutedStyle }, '缓存读 / 写'),
										h('span', { style: mutedStyle }, formatTokens(state.totals?.cacheReadTokens || 0) + ' / ' + formatTokens(state.totals?.cacheWriteTokens || 0)),
									)
								: null,
							h('div', { style: { ...rowStyle, marginTop: '4px', fontSize: '11px' } },
								h('span', { style: mutedStyle }, '会话数'),
								h('span', { style: mutedStyle }, String(state.totals?.sessions || 0)),
							),
							state.balanceError
								? h('div', { style: { color: '#ef4444', marginTop: '4px', fontSize: '11px' } }, '余额接口：' + state.balanceError)
								: (state.balanceAt
										? h('div', { style: { ...mutedStyle, marginTop: '4px', fontSize: '11px' } }, '更新于 ' + relativeTime(state.balanceAt))
										: null),
							error ? h('div', { style: { color: '#ef4444', marginTop: '4px', fontSize: '11px' } }, '请求失败：' + error) : null,
						)
					: null,
			)
		}

		/**
		 * Client plugin body: register the badge into the sidebar footer action slot.
		 */
		function apply(ctx) {
			ctx.slots.inject('sidebar.footer.action', () =>
				ctx.slots.register(
					{
						name: 'sidebar.footer.action',
						id: 'cost-badge',
						order: 40,
						inject: () => ({}),
					},
					CostBadge,
				),
			)
		}
		exports.apply = apply;

		return module.exports;
	}
});
