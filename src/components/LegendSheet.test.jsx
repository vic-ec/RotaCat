import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import LegendSheet from './LegendSheet'

function renderSheet(overrides = {}) {
  return render(
    <LegendSheet
      trigger={onClick => <button type="button" onClick={onClick}>Open legend</button>}
      {...overrides}
    >
      <p>Legend body content</p>
    </LegendSheet>
  )
}

describe('LegendSheet', () => {
  it('renders only the trigger until clicked', () => {
    renderSheet()
    expect(screen.getByRole('button', { name: 'Open legend' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByText('Legend body content')).not.toBeInTheDocument()
  })

  it('opens the sheet with the body content on trigger click, and closes via the × button', async () => {
    const user = userEvent.setup()
    renderSheet()

    await user.click(screen.getByRole('button', { name: 'Open legend' }))
    const sheet = screen.getByRole('dialog', { name: 'Legend' })
    expect(within(sheet).getByText('Legend body content')).toBeInTheDocument()

    await user.click(within(sheet).getByLabelText('Close'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('closes on backdrop click', async () => {
    const user = userEvent.setup()
    const { container } = renderSheet()
    await user.click(screen.getByRole('button', { name: 'Open legend' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    await user.click(container.querySelector('.fixed.inset-0'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('uses a custom title when given', async () => {
    const user = userEvent.setup()
    renderSheet({ title: 'Custom title' })
    await user.click(screen.getByRole('button', { name: 'Open legend' }))
    expect(screen.getByRole('dialog', { name: 'Custom title' })).toBeInTheDocument()
  })

  it('omits the "How it works" footer when no ruleBullets are given', async () => {
    const user = userEvent.setup()
    renderSheet()
    await user.click(screen.getByRole('button', { name: 'Open legend' }))
    expect(screen.queryByText('How it works')).not.toBeInTheDocument()
  })

  it('shows the "How it works" footer (intro + bullets + Full rules link) when ruleBullets are given', async () => {
    const user = userEvent.setup()
    renderSheet({ ruleIntro: 'The intro sentence.', ruleBullets: ['First rule.', 'Second rule.'] })
    await user.click(screen.getByRole('button', { name: 'Open legend' }))

    const sheet = screen.getByRole('dialog')
    expect(within(sheet).getByText('How it works')).toBeInTheDocument()
    expect(within(sheet).getByText('The intro sentence.')).toBeInTheDocument()
    expect(within(sheet).getByText('First rule.')).toBeInTheDocument()
    expect(within(sheet).getByText('Second rule.')).toBeInTheDocument()
    expect(within(sheet).getByRole('link', { name: 'Full rules' })).toHaveAttribute(
      'href', 'https://github.com/vic-ec/RotaCat/blob/main/EC_LEAVE_PLANNER_RULES.md'
    )
  })

  it('honours a custom rulesUrl', async () => {
    const user = userEvent.setup()
    renderSheet({ ruleBullets: ['A rule.'], rulesUrl: 'https://example.com/rules' })
    await user.click(screen.getByRole('button', { name: 'Open legend' }))
    expect(screen.getByRole('link', { name: 'Full rules' })).toHaveAttribute('href', 'https://example.com/rules')
  })
})
