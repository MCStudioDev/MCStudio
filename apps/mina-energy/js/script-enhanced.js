// Enhanced Website Functionality for Mina Energy Storage Consulting
// Comprehensive JavaScript with modern features, animations, and enhanced user experience

class EnhancedWebsite {
  constructor() {
    this.init();
  }

  init() {
    this.initSmoothScroll();
    this.initHamburgerMenu();
    this.initScrollAnimations();
    this.initScrollProgress();
    this.initContactForm();
    this.initLinkedInIntegration();
    this.initAccessibility();
    this.initScrollEffects();
    this.initBackToTop();
    this.initScrollSpy();
    this.initLazyLoading();
    this.initPerformanceMonitoring();
  }

  // Enhanced Smooth Scrolling with Easing
  initSmoothScroll() {
    const observerOptions = {
      threshold: 0,
      rootMargin: '0px 0px -10% 0px'
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('animate-in');
        }
      });
    }, observerOptions);

    document.querySelectorAll('.animate-on-scroll').forEach(el => {
      observer.observe(el);
    });

    // Smooth scroll for navigation links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
      anchor.addEventListener('click', (e) => {
        e.preventDefault();
        const target = document.querySelector(anchor.getAttribute('href'));
        if (target) {
          const headerOffset = 80;
          const elementPosition = target.getBoundingClientRect().top;
          const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

          window.scrollTo({
            top: offsetPosition,
            behavior: 'smooth'
          });
        }
      });
    });
  }

  // Enhanced Mobile Hamburger Menu with Animation
  initHamburgerMenu() {
    const hamburger = document.getElementById('hamburger');
    const navMenu = document.querySelector('.nav-menu');
    const navbar = document.getElementById('navbar');

    if (hamburger && navMenu) {
      hamburger.addEventListener('click', () => {
        hamburger.classList.toggle('active');
        navMenu.classList.toggle('active');
        
        // Add animation class for smooth transition
        if (navMenu.classList.contains('active')) {
          navMenu.style.maxHeight = navMenu.scrollHeight + 'px';
        } else {
          navMenu.style.maxHeight = null;
        }
      });

      // Close menu when clicking on nav links
      document.querySelectorAll('.nav-link').forEach(n => n.addEventListener('click', () => {
        hamburger.classList.remove('active');
        navMenu.classList.remove('active');
        navMenu.style.maxHeight = null;
      }));

      // Close menu when clicking outside
      document.addEventListener('click', (e) => {
        if (!hamburger.contains(e.target) && !navMenu.contains(e.target)) {
          hamburger.classList.remove('active');
          navMenu.classList.remove('active');
          navMenu.style.maxHeight = null;
        }
      });

      // Close menu on window resize (desktop view)
      window.addEventListener('resize', () => {
        if (window.innerWidth > 992) {
          hamburger.classList.remove('active');
          navMenu.classList.remove('active');
          navMenu.style.maxHeight = null;
        }
      });
    }

    // Enhanced navbar scroll effect
    window.addEventListener('scroll', () => {
      if (window.scrollY > 100) {
        navbar.classList.add('scrolled');
      } else {
        navbar.classList.remove('scrolled');
      }
    });
  }

  // Enhanced Scroll-triggered Animations
  initScrollAnimations() {
    const observerOptions = {
      threshold: 0.1,
      rootMargin: '0px 0px -20% 0px'
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('animate-in');
        }
      });
    }, observerOptions);

    // Observe various elements for animations
    const animatedElements = [
      '.about-grid',
      '.services-grid',
      '.expertise-grid',
      '.contact-grid',
      '.blog-grid',
      '.linkedin-widget',
      '.section-title'
    ];

    animatedElements.forEach(selector => {
      document.querySelectorAll(selector).forEach(el => {
        el.classList.add('animate-on-scroll');
        observer.observe(el);
      });
    });
  }

  // Enhanced Scroll Progress Indicator
  initScrollProgress() {
    const scrollProgress = document.getElementById('scrollProgress');
    
    if (scrollProgress) {
      window.addEventListener('scroll', () => {
        const scrolled = (window.scrollY / (document.documentElement.scrollHeight - window.innerHeight)) * 100;
        scrollProgress.style.width = `${scrolled}%`;
      });
    }
  }

  // Enhanced Contact Form with Validation and Animation
  initContactForm() {
    const form = document.getElementById('contactForm');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (this.validateForm(form)) {
          this.submitForm(form);
        }
      });

      // Real-time validation feedback
      const inputs = form.querySelectorAll('input, textarea');
      inputs.forEach(input => {
        input.addEventListener('blur', () => {
          this.validateField(input);
        });
        
        input.addEventListener('input', () => {
          const errorElement = input.parentElement.querySelector('.error-message');
          if (errorElement) {
            errorElement.style.display = 'none';
            input.classList.remove('error');
          }
        });
      });
    }
  }

  validateForm(form) {
    let isValid = true;
    const inputs = form.querySelectorAll('input, textarea');
    
    // Clear previous errors
    form.querySelectorAll('.error-message').forEach(el => el.remove());
    
    inputs.forEach(input => {
      if (!this.validateField(input)) {
        isValid = false;
      }
    });

    return isValid;
  }

  validateField(input) {
    const errorElement = this.createErrorElement(input);
    let isValid = true;
    
    if (!input.value.trim()) {
      this.showError(input, errorElement, 'This field is required');
      isValid = false;
    } else if (input.type === 'email' && !this.isValidEmail(input.value)) {
      this.showError(input, errorElement, 'Please enter a valid email address');
      isValid = false;
    } else if (input.type === 'text' && input.name !== 'subject' && input.value.length < 2) {
      this.showError(input, errorElement, 'Name must be at least 2 characters');
      isValid = false;
    } else {
      this.hideError(input, errorElement);
    }

    return isValid;
  }

  createErrorElement(input) {
    let errorElement = input.parentElement.querySelector('.error-message');
    if (!errorElement) {
      errorElement = document.createElement('div');
      errorElement.className = 'error-message';
      input.parentElement.appendChild(errorElement);
    }
    return errorElement;
  }

  showError(input, errorElement, message) {
    errorElement.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${message}`;
    input.classList.add('error');
    errorElement.style.display = 'block';
  }

  hideError(input, errorElement) {
    errorElement.style.display = 'none';
    input.classList.remove('error');
  }

  isValidEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  }

  async submitForm(form) {
    const formData = new FormData(form);
    const submitBtn = form.querySelector('.submit-btn');
    const originalText = submitBtn.innerHTML;
    const originalDisabled = submitBtn.disabled;

    try {
      submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
      submitBtn.disabled = true;
      submitBtn.style.opacity = '0.7';

      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1500));

      // For now, just show success message
      this.showSuccess(form, 'Message sent successfully! We\'ll get back to you soon.');
      form.reset();
      
      // Reset button
      setTimeout(() => {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = originalDisabled;
        submitBtn.style.opacity = '1';
      }, 3000);

    } catch (error) {
      this.showError(form, this.createErrorElement(form), 'Failed to send message. Please try again.');
      submitBtn.innerHTML = originalText;
      submitBtn.disabled = originalDisabled;
      submitBtn.style.opacity = '1';
    }
  }

  showSuccess(form, message) {
    const successElement = document.createElement('div');
    successElement.className = 'success-message';
    successElement.innerHTML = `<i class="fas fa-check-circle"></i> ${message}`;
    form.parentElement.insertBefore(successElement, form);
    
    setTimeout(() => {
      successElement.remove();
    }, 5000);
  }

  // Enhanced LinkedIn Integration
  initLinkedInIntegration() {
    const linkedinWidget = document.getElementById('linkedin-posts');
    if (linkedinWidget) {
      this.loadLinkedInPosts();
    }
  }

  async loadLinkedInPosts() {
    try {
      // In a real implementation, this would be:
      // const response = await fetch('/api/linkedin-posts');
      // const posts = await response.json();
      
      // For now, using static data with enhanced features
      const posts = [
        {
          title: "Energy Storage Market Analysis 2024",
          excerpt: "The energy storage market continues to show exponential growth with new technologies emerging...",
          date: "2024-03-01",
          url: "https://linkedin.com/pulse/energy-storage-market-analysis-2024",
          category: "Market Analysis",
          readTime: "8 min read"
        },
        {
          title: "Battery Technology Breakthroughs",
          excerpt: "Exciting developments in solid-state battery technology are reshaping the future of energy storage...",
          date: "2024-02-15",
          url: "https://linkedin.com/pulse/battery-technology-breakthroughs",
          category: "Technology",
          readTime: "10 min read"
        },
        {
          title: "EV Charging Infrastructure Growth",
          excerpt: "The rapid expansion of EV charging networks is creating new opportunities for energy storage...",
          date: "2024-01-20",
          url: "https://linkedin.com/pulse/ev-charging-infrastructure-growth",
          category: "Infrastructure",
          readTime: "6 min read"
        }
      ];

      this.renderLinkedInPosts(posts);
    } catch (error) {
      console.error('LinkedIn API Error:', error);
      this.showLinkedInFallback();
    }
  }

  renderLinkedInPosts(posts) {
    const linkedinWidget = document.getElementById('linkedin-posts');
    if (linkedinWidget) {
      linkedinWidget.innerHTML = '';
      
      posts.forEach(post => {
        const postElement = document.createElement('div');
        postElement.className = 'linkedin-post animate-on-scroll';
        postElement.innerHTML = `
          <div class="blog-meta">
            <span><i class="fas fa-clock"></i> ${post.readTime}</span>
            <span><i class="fab fa-linkedin"></i> ${post.category}</span>
            <span><i class="fas fa-calendar"></i> ${this.formatDate(post.date)}</span>
          </div>
          <h4>${post.title}</h4>
          <p class="post-excerpt">${post.excerpt}</p>
          <a href="${post.url}" target="_blank" class="post-link">
            Read on LinkedIn <i class="fab fa-linkedin"></i>
          </a>
        `;
        linkedinWidget.appendChild(postElement);
      });
    }
  }

  showLinkedInFallback() {
    const linkedinWidget = document.getElementById('linkedin-posts');
    if (linkedinWidget) {
      linkedinWidget.innerHTML = `
        <div class="animate-on-scroll" style="text-align: center; padding: 2rem; color: var(--neutral-gray);">
          <i class="fab fa-linkedin" style="font-size: 3rem; color: #0077b5; margin-bottom: 1rem;"></i>
          <h4>Connect on LinkedIn</h4>
          <p>For the latest industry insights and updates, please visit my LinkedIn profile.</p>
          <a href="https://linkedin.com/in/minanaguib42" target="_blank" class="btn btn-primary" style="margin-top: 1rem; display: inline-block;">
            Visit LinkedIn Profile
          </a>
        </div>
      `;
    }
  }

  formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  }

  // Enhanced Accessibility Features
  initAccessibility() {
    // Skip link functionality
    const skipLink = document.querySelector('.skip-link');
    if (skipLink) {
      skipLink.addEventListener('click', (e) => {
        e.preventDefault();
        const target = document.querySelector(e.target.getAttribute('href')) || 
                      document.querySelector('main') || 
                      document.querySelector('.hero');
        if (target) {
          target.focus();
        }
      });
    }

    // Keyboard navigation for mobile menu
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const hamburger = document.getElementById('hamburger');
        const navMenu = document.querySelector('.nav-menu');
        if (hamburger && navMenu) {
          hamburger.classList.remove('active');
          navMenu.classList.remove('active');
          navMenu.style.maxHeight = null;
        }
      }
    });

    // ARIA labels for interactive elements
    document.querySelectorAll('.hamburger').forEach(btn => {
      btn.setAttribute('aria-label', 'Toggle navigation menu');
      btn.setAttribute('aria-expanded', 'false');
    });

    document.querySelectorAll('.nav-link').forEach(link => {
      link.setAttribute('aria-current', 'page');
    });

    // Focus management for modals and overlays
    document.addEventListener('focusin', (e) => {
      if (e.target.tagName === 'A' || e.target.tagName === 'BUTTON') {
        e.target.classList.add('focus-visible');
      }
    });
  }

  // Enhanced Scroll Effects
  initScrollEffects() {
    const hero = document.querySelector('.hero');
    const navbar = document.getElementById('navbar');

    if (hero) {
      window.addEventListener('scroll', () => {
        const scrolled = window.pageYOffset;
        const parallaxSpeed = scrolled * 0.5;
        
        // Parallax effect for hero background
        hero.style.transform = `translateY(${parallaxSpeed}px)`;
      });
    }

    // Enhanced scroll spy for navigation
    this.initScrollSpy();
  }

  // Enhanced Scroll Spy with Active States
  initScrollSpy() {
    const sections = document.querySelectorAll('section[id]');
    const navLinks = document.querySelectorAll('.nav-link');

    window.addEventListener('scroll', () => {
      let current = '';
      const scrollPosition = window.scrollY + 100;

      sections.forEach(section => {
        const sectionTop = section.offsetTop;
        const sectionHeight = section.clientHeight;
        
        if (scrollPosition >= sectionTop && scrollPosition < sectionTop + sectionHeight) {
          current = section.getAttribute('id');
        }
      });

      navLinks.forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('href') === `#${current}`) {
          link.classList.add('active');
        }
      });
    });
  }

  // Enhanced Back to Top Button
  initBackToTop() {
    const backToTopBtn = document.getElementById('backToTop');
    
    if (backToTopBtn) {
      window.addEventListener('scroll', () => {
        if (window.scrollY > 300) {
          backToTopBtn.style.display = 'flex';
          backToTopBtn.style.opacity = '1';
          backToTopBtn.style.transform = 'translateY(0)';
        } else {
          backToTopBtn.style.opacity = '0';
          backToTopBtn.style.transform = 'translateY(20px)';
          setTimeout(() => {
            backToTopBtn.style.display = 'none';
          }, 300);
        }
      });

      backToTopBtn.addEventListener('click', () => {
        window.scrollTo({
          top: 0,
          behavior: 'smooth'
        });
      });
    }
  }

  // Enhanced Lazy Loading
  initLazyLoading() {
    if ('IntersectionObserver' in window) {
      const imageObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const img = entry.target;
            img.src = img.dataset.src;
            img.classList.remove('lazy');
            observer.unobserve(img);
          }
        });
      });

      document.querySelectorAll('img.lazy').forEach(img => {
        imageObserver.observe(img);
      });
    }
  }

  // Performance Monitoring
  initPerformanceMonitoring() {
    // Monitor Core Web Vitals
    if ('PerformanceObserver' in window) {
      const observer = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          if (entry.entryType === 'largest-contentful-paint') {
            console.log('LCP:', entry.startTime);
          }
        });
      });
      
      observer.observe({ entryTypes: ['largest-contentful-paint'] });
    }

    // Monitor resource loading
    window.addEventListener('load', () => {
      const loadTime = performance.timing.loadEventEnd - performance.timing.navigationStart;
      console.log(`Page loaded in ${loadTime}ms`);
    });
  }

  // Utility Functions
  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  throttle(func, limit) {
    let inThrottle;
    return function(...args) {
      if (!inThrottle) {
        func.apply(this, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  }
}

// Initialize the enhanced website when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new EnhancedWebsite();
  
  // Add loading animation
  document.body.style.opacity = '0';
  document.body.style.transition = 'opacity 0.5s ease';
  
  setTimeout(() => {
    document.body.style.opacity = '1';
  }, 100);

  // Add page load completion event
  window.addEventListener('load', () => {
    // Preload critical images
    const criticalImages = [
      'assets/images/hero-bg.jpg',
      'assets/images/team-photo.jpg'
    ];
    
    criticalImages.forEach(src => {
      const img = new Image();
      img.src = src;
    });
  });
});

// Error handling for console in production
window.addEventListener('error', (e) => {
  console.error('JavaScript Error:', e.error);
  // In production, you might want to send this to an error tracking service
});

// Handle offline/online status
window.addEventListener('online', () => {
  console.log('Back online');
  // Show online indicator
});

window.addEventListener('offline', () => {
  console.log('You are now offline');
  // Show offline message to user
  const offlineMessage = document.createElement('div');
  offlineMessage.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    background: #ef4444;
    color: white;
    text-align: center;
    padding: 1rem;
    z-index: 1000;
    animation: slideDown 0.3s ease;
  `;
  offlineMessage.textContent = 'You are now offline. Some features may not be available.';
  document.body.appendChild(offlineMessage);
  
  setTimeout(() => {
    offlineMessage.remove();
  }, 5000);
});

// Add CSS animation for offline message
const style = document.createElement('style');
style.textContent = `
  @keyframes slideDown {
    from { transform: translateY(-100%); }
    to { transform: translateY(0); }
  }
`;
document.head.appendChild(style);