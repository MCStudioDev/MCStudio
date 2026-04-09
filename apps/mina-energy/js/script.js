// Enhanced Website Functionality
class WebsiteEnhancer {
  constructor() {
    this.initSmoothScroll();
    this.initHamburgerMenu();
    this.initScrollAnimations();
    this.initScrollProgress();
    this.initContactForm();
    this.initLinkedInIntegration();
    this.initAccessibility();
  }

  // Smooth Scrolling Navigation
  initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
      anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
          const headerOffset = 80;
          const elementPosition = target.getBoundingClientRect().top;
          const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

          window.scrollTo({
            top
            behavior: 'smooth'
          });
        }
      });
    });
  }

  // Mobile Hamburger Menu
  initHamburgerMenu() {
    const hamburger = document.querySelector('.hamburger');
    const navMenu = document.querySelector('.nav-menu');

    if (hamburger && navMenu) {
      hamburger.addEventListener('click', () => {
        hamburger.classList.toggle('active');
        navMenu.classList.toggle('active');
      });

      // Close menu when clicking on nav links
      document.querySelectorAll('.nav-link').forEach(n => n.addEventListener('click', () => {
        hamburger.classList.remove('active');
        navMenu.classList.remove('active');
      }));

      // Close menu when clicking outside
      document.addEventListener('click', (e) => {
        if (!hamburger.contains(e.target) && !navMenu.contains(e.target)) {
          hamburger.classList.remove('active');
          navMenu.classList.remove('active');
        }
      });
    }
  }

  // Scroll-triggered Animations
  initScrollAnimations() {
    const observerOptions = {
      threshold: 0.1,
      rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('animate-in');
        }
      });
    }, observerOptions);

    document.querySelectorAll('.about-grid, .services-grid, .expertise-grid, .contact-grid, .blog-grid, .linkedin-widget').forEach(el => {
      el.classList.add('animate-on-scroll');
      observer.observe(el);
    });
  }

  // Scroll Progress Indicator
  initScrollProgress() {
    const scrollProgress = document.querySelector('.scroll-progress');
    
    if (scrollProgress) {
      window.addEventListener('scroll', () => {
        const scrolled = (window.scrollY / (document.documentElement.scrollHeight - window.innerHeight)) * 100;
        scrollProgress.style.width = `${scrolled}%`;
      });
    }
  }

  // Contact Form Validation and Submission
  initContactForm() {
    const form = document.getElementById('contactForm');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (this.validateForm(form)) {
          this.submitForm(form);
        }
      });
    }
  }

  validateForm(form) {
    let isValid = true;
    const inputs = form.querySelectorAll('input, textarea');
    
    // Clear previous errors
    form.querySelectorAll('.error-message').forEach(el => el.remove());
    
    inputs.forEach(input => {
      const errorElement = this.createErrorElement(input);
      
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
    });

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
  }

  hideError(input, errorElement) {
    errorElement.innerHTML = '';
    input.classList.remove('error');
  }

  isValidEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  }

  async submitForm(form) {
    const formData = new FormData(form);
    const submitBtn = form.querySelector('.submit-btn');
    const originalText = submitBtn.textContent;

    try {
      submitBtn.textContent = 'Sending...';
      submitBtn.disabled = true;
      submitBtn.style.opacity = '0.7';

      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));

      // For now, just show success message
      this.showSuccess(form, 'Message sent successfully! We\'ll get back to you soon.');
      form.reset();
      
      // Reset button
      setTimeout(() => {
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
        submitBtn.style.opacity = '1';
      }, 3000);

    } catch (error) {
      this.showError(form, this.createErrorElement(form), 'Failed to send message. Please try again.');
      submitBtn.textContent = originalText;
      submitBtn.disabled = false;
      submitBtn.style.opacity = '1';
    }
  }

  showSuccess(form, message) {
    const successElement = document.createElement('div');
    successElement.className = 'success-message';
    successElement.textContent = message;
    form.parentElement.insertBefore(successElement, form);
    
    setTimeout(() => {
      successElement.remove();
    }, 5000);
  }

  // LinkedIn Integration
  initLinkedInIntegration() {
    const linkedinWidget = document.getElementById('linkedin-posts');
    if (linkedinWidget) {
      // For now, we'll use static content
      // In a real implementation, this would fetch from LinkedIn API
      this.loadLinkedInPosts();
    }
  }

  async loadLinkedInPosts() {
    try {
      // In a real implementation, this would be:
      // const response = await fetch('/api/linkedin-posts');
      // const posts = await response.json();
      
      // For now, using static data
      const posts = [
        {
          title: "Energy Storage Market Analysis 2024",
          excerpt: "The energy storage market continues to show exponential growth with new technologies emerging...",
          date: "2024-03-01",
          url: "https://linkedin.com/pulse/energy-storage-market-analysis-2024"
        },
        {
          title: "Battery Technology Breakthroughs",
          excerpt: "Exciting developments in solid-state battery technology are reshaping the future of energy storage...",
          date: "2024-02-15",
          url: "https://linkedin.com/pulse/battery-technology-breakthroughs"
        },
        {
          title: "EV Charging Infrastructure Growth",
          excerpt: "The rapid expansion of EV charging networks is creating new opportunities for energy storage...",
          date: "2024-01-20",
          url: "https://linkedin.com/pulse/ev-charging-infrastructure-growth"
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
        postElement.className = 'linkedin-post';
        postElement.innerHTML = `
          <h4>${post.title}</h4>
          <span class="post-date">${this.formatDate(post.date)}</span>
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
        <div style="text-align: center; padding: 2rem; color: var(--text-secondary);">
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

  // Accessibility Enhancements
  initAccessibility() {
    // Skip link functionality
    const skipLink = document.querySelector('.skip-link');
    if (skipLink) {
      skipLink.addEventListener('click', (e) => {
        e.preventDefault();
        const target = document.querySelector('#main-content') || document.querySelector('main') || document.querySelector('.hero');
        if (target) {
          target.focus();
        }
      });
    }

    // Keyboard navigation for mobile menu
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const hamburger = document.querySelector('.hamburger');
        const navMenu = document.querySelector('.nav-menu');
        if (hamburger && navMenu) {
          hamburger.classList.remove('active');
          navMenu.classList.remove('active');
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
  }

  // Utility functions
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
}

// Initialize website enhancements when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new WebsiteEnhancer();
  
  // Add some visual feedback for loading
  document.body.style.opacity = '0';
  document.body.style.transition = 'opacity 0.3s ease';
  
  setTimeout(() => {
    document.body.style.opacity = '1';
  }, 100);
});

// Performance optimizations
window.addEventListener('load', () => {
  // Preload critical images
  const images = [
    'images/hero-bg.jpg',
    'images/team-photo.jpg'
  ];
  
  images.forEach(src => {
    const img = new Image();
    img.src = src;
  });
});

// Handle window resize for responsive design
window.addEventListener('resize', () => {
  // Debounced resize handler
  const debouncedResize = debounce(() => {
    // Update any responsive elements if needed
  }, 250);
  
  debouncedResize();
});

// Error handling for console in production
window.addEventListener('error', (e) => {
  console.error('JavaScript Error:', e.error);
  // In production, you might want to send this to an error tracking service
});

// Handle offline/online status
window.addEventListener('online', () => {
  console.log('Back online');
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
  `;
  offlineMessage.textContent = 'You are now offline. Some features may not be available.';
  document.body.appendChild(offlineMessage);
  
  setTimeout(() => {
    offlineMessage.remove();
  }, 5000);
});