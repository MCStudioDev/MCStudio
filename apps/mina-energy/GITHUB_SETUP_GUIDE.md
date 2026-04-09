# GitHub Pages Setup Guide

## How to Host Your Website for Free on GitHub Pages

### Step 1: Create GitHub Account
1. Go to [github.com](https://github.com)
2. Click "Sign up"
3. Choose "Free" plan
4. Verify your email address

### Step 2: Create New Repository
1. After logging in, click the "+" icon in the top right
2. Select "New repository"
3. Repository name: `mina-energy-consulting`
4. Description: "Professional energy storage consultant website"
5. Make sure it's set to "Public"
6. Check "Add a README file"
7. Click "Create repository"

### Step 3: Upload Your Website Files
1. In your new repository, click "Upload files"
2. Drag and drop the entire contents of your `mina-energy-consulting` folder:
   - `index.html`
   - `README.md`
   - `css/` folder
   - `js/` folder
   - `images/` folder
3. Add a commit message: "Initial website upload"
4. Click "Commit changes"

### Step 4: Enable GitHub Pages
1. Go to your repository settings (click "Settings" tab)
2. Scroll down to "Pages" section in the left sidebar
3. Under "Source", select "Deploy from a branch"
4. Choose "main" branch
5. Click "Save"

### Step 5: Your Website is Live!
Your website will be available at:
`https://yourusername.github.io/mina-energy-consulting/`

### Step 6: Optional - Custom Domain
If you want a custom domain (like minaenergyconsulting.com):
1. Purchase domain from providers like Namecheap, GoDaddy, etc.
2. In GitHub Pages settings, add your custom domain
3. Configure DNS settings with your domain provider

## File Structure for GitHub
```
mina-energy-consulting/
├── index.html          # Main website file
├── README.md           # Documentation
├── css/
│   └── styles.css      # Website styling
├── js/
│   └── script.js       # Website functionality
└── images/             # For future images
```

## Troubleshooting
- If website doesn't load, wait 5-10 minutes for GitHub to process
- Make sure all files are uploaded to the root of the repository
- Check that the repository is public
- Verify GitHub Pages is enabled in settings

## Updating Your Website
To make changes in the future:
1. Edit files locally
2. Go to your GitHub repository
3. Upload updated files
4. Commit changes
5. Website updates automatically

## Support
- GitHub Pages Documentation: https://docs.github.com/en/pages
- GitHub Community Forum: https://github.community