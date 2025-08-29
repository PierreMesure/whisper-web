#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Paths
VOICE_APP_DIR="/Users/sanchitmonga/development/EXTERNAL/whisper-web/whisper-web"
NEXTJS_APP_DIR="/Users/sanchitmonga/development/ODLM/runanywhere_landing_fe/app"
WEB_DEMO_DIR="${NEXTJS_APP_DIR}/public/web-demo"

echo -e "${BLUE}🚀 RunAnywhere Voice Pipeline - Build & Deploy Script${NC}"
echo "=================================================="

# Step 1: Build Voice Pipeline App
echo -e "\n${YELLOW}[1/5] Building Voice Pipeline App...${NC}"
cd "$VOICE_APP_DIR"

# Clean previous build
rm -rf dist

# Build with Vite (skipping TypeScript checks for faster build)
npx vite build
if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Voice app build failed!${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Voice app built successfully${NC}"

# Step 2: Clean up destination
echo -e "\n${YELLOW}[2/5] Cleaning up destination...${NC}"
rm -rf "$WEB_DEMO_DIR"
echo -e "${GREEN}✓ Old files removed${NC}"

# Step 3: Copy built files
echo -e "\n${YELLOW}[3/5] Copying files to Next.js app...${NC}"
cp -r dist "$WEB_DEMO_DIR"
if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Failed to copy files!${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Files copied to ${WEB_DEMO_DIR}${NC}"

# Step 4: Build Next.js App
echo -e "\n${YELLOW}[4/5] Building Next.js app...${NC}"
cd "$NEXTJS_APP_DIR"

# Run Next.js build
npm run build
if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Next.js build failed!${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Next.js app built successfully${NC}"

# Step 5: Summary
echo -e "\n${GREEN}================================${NC}"
echo -e "${GREEN}✅ BUILD COMPLETE!${NC}"
echo -e "${GREEN}================================${NC}"
echo
echo -e "📦 Voice app built at: ${VOICE_APP_DIR}/dist"
echo -e "📋 Copied to: ${WEB_DEMO_DIR}"
echo -e "🏗️  Next.js built at: ${NEXTJS_APP_DIR}/.next"
echo
echo -e "${BLUE}Next steps:${NC}"
echo -e "  • Test locally: ${YELLOW}npm run start${NC}"
echo -e "  • Deploy to Vercel: ${YELLOW}vercel --prod${NC}"
echo -e "  • Access at: ${GREEN}https://runanywhere.ai/web-demo/${NC}"
echo
echo -e "${YELLOW}To run the development server:${NC}"
echo -e "  cd ${NEXTJS_APP_DIR}"
echo -e "  npm run dev"
echo
echo -e "${YELLOW}To deploy to production:${NC}"
echo -e "  cd ${NEXTJS_APP_DIR}"
echo -e "  vercel --prod"