import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route, Link, useSearchParams } from 'react-router-dom'
import { pageLabel, useBackTarget, drawsOwnBack } from './backNav'

function Shell() {
  const target = useBackTarget()
  const [, setParams] = useSearchParams()
  return (
    <>
      <p data-testid="back">{target ? target.label : 'none'}</p>
      <Link to="/my-year">year link</Link>
      <Link to="/leave?tab=requests">requests link</Link>
      <Link to="/staff" state={{ navTab: true }}>staff tab</Link>
      <button type="button" onClick={() => setParams({ tab: 'leave' })}>switch tab</button>
    </>
  )
}
const app = (path = '/') => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes><Route path="*" element={<Shell />} /></Routes>
  </MemoryRouter>,
)

beforeEach(() => sessionStorage.clear())

describe('backNav', () => {
  it('names pages', () => {
    expect(pageLabel('/')).toBe('Dashboard')
    expect(pageLabel('/leave', '?tab=requests')).toBe('Requests')
    expect(pageLabel('/roster', '?view=summary')).toBe('Hours Summary')
    expect(pageLabel('/my-year/abc')).toBe('Year')
    expect(drawsOwnBack('/roster/abc')).toBe(true)
    expect(drawsOwnBack('/roster/generate')).toBe(false)
  })

  it('gives a page opened by a link a back to the page before; a tab bar click gives none', () => {
    app('/')
    expect(screen.getByTestId('back')).toHaveTextContent('none')
    fireEvent.click(screen.getByText('year link'))
    expect(screen.getByTestId('back')).toHaveTextContent('Dashboard')
    fireEvent.click(screen.getByText('staff tab'))
    expect(screen.getByTestId('back')).toHaveTextContent('none')
  })

  it('keeps the original back when a tab inside the page changes', () => {
    app('/')
    fireEvent.click(screen.getByText('year link'))
    fireEvent.click(screen.getByText('switch tab'))
    expect(screen.getByTestId('back')).toHaveTextContent('Dashboard')
  })
})
