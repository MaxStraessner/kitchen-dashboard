import type { ComponentPropsWithoutRef, ReactNode } from 'react'

interface CardProps extends ComponentPropsWithoutRef<'section'> {
  children: ReactNode
  tone?: 'default' | 'warm' | 'green'
}

export function Card({ children, className = '', tone = 'default', ...props }: CardProps) {
  return (
    <section className={`card card--${tone} ${className}`.trim()} {...props}>
      {children}
    </section>
  )
}
