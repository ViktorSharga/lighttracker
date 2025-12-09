import gsap from 'gsap'

/**
 * GSAP animation utilities for LightTracker
 * Provides reusable animation functions for common UI patterns
 */
export function useAnimation() {
  /**
   * Animates a number counter from one value to another
   * @param el HTML element to update
   * @param from Starting value
   * @param to Ending value
   * @param duration Animation duration in seconds (default: 1)
   */
  const animateCounter = (
    el: HTMLElement,
    from: number,
    to: number,
    duration = 1
  ): gsap.core.Tween => {
    const obj = { value: from }
    return gsap.to(obj, {
      value: to,
      duration,
      ease: 'power2.out',
      onUpdate: () => {
        el.textContent = Math.round(obj.value).toString()
      },
    })
  }

  /**
   * Animates element entrance with fade and slide up
   * @param el HTML element to animate
   * @param delay Delay before animation starts in seconds (default: 0)
   */
  const animateEnter = (el: HTMLElement, delay = 0): gsap.core.Tween => {
    return gsap.from(el, {
      opacity: 0,
      y: 20,
      duration: 0.6,
      delay,
      ease: 'power2.out',
    })
  }

  /**
   * Animates a list of elements with stagger effect
   * @param container Container element
   * @param selector CSS selector for child elements to animate
   * @param staggerDelay Delay between each item in seconds (default: 0.1)
   */
  const animateStaggeredList = (
    container: HTMLElement,
    selector: string,
    staggerDelay = 0.1
  ): gsap.core.Timeline => {
    const elements = container.querySelectorAll(selector)
    return gsap.from(elements, {
      opacity: 0,
      y: 20,
      duration: 0.5,
      stagger: staggerDelay,
      ease: 'power2.out',
    })
  }

  /**
   * Creates a pulsing animation effect
   * @param el HTML element to animate
   * @param scale Maximum scale value (default: 1.05)
   */
  const animatePulse = (el: HTMLElement, scale = 1.05): gsap.core.Tween => {
    return gsap.to(el, {
      scale,
      duration: 0.8,
      repeat: -1,
      yoyo: true,
      ease: 'power1.inOut',
    })
  }

  /**
   * Animates tab transition with cross-fade
   * @param leaving Element that is leaving
   * @param entering Element that is entering
   */
  const animateTabTransition = async (
    leaving: HTMLElement,
    entering: HTMLElement
  ): Promise<void> => {
    const timeline = gsap.timeline()

    // Fade out leaving element
    timeline.to(leaving, {
      opacity: 0,
      x: -20,
      duration: 0.3,
      ease: 'power2.in',
    })

    // Fade in entering element
    timeline.from(
      entering,
      {
        opacity: 0,
        x: 20,
        duration: 0.3,
        ease: 'power2.out',
      },
      '-=0.1' // Start slightly before previous animation ends
    )

    return timeline.then()
  }

  /**
   * Animates a card flip effect
   * @param el Element to flip
   * @param duration Duration in seconds (default: 0.6)
   */
  const animateFlip = (el: HTMLElement, duration = 0.6): gsap.core.Tween => {
    return gsap.to(el, {
      rotationY: 180,
      duration,
      ease: 'power2.inOut',
      transformPerspective: 1000,
    })
  }

  /**
   * Shakes an element (useful for errors or attention)
   * @param el Element to shake
   */
  const animateShake = (el: HTMLElement): gsap.core.Timeline => {
    return gsap.timeline().to(el, {
      x: -10,
      duration: 0.1,
      repeat: 5,
      yoyo: true,
      ease: 'power1.inOut',
    })
  }

  /**
   * Bounces an element (useful for notifications)
   * @param el Element to bounce
   */
  const animateBounce = (el: HTMLElement): gsap.core.Timeline => {
    return gsap.timeline().to(el, {
      y: -10,
      duration: 0.3,
      repeat: 3,
      yoyo: true,
      ease: 'power1.out',
    })
  }

  return {
    animateCounter,
    animateEnter,
    animateStaggeredList,
    animatePulse,
    animateTabTransition,
    animateFlip,
    animateShake,
    animateBounce,
  }
}
