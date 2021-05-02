yarn build
# vuepress will redirect automanually x to x.html
# to disable redirect will install another dependencies
find dist -type f -name "*.js" -print0 | xargs -0 sed -i 's/"\.html"/""/g'
find dist -type f -name "*.js" -print0 | xargs -0 sed -i 's/\.html"/"/g'
find dist -type f -name "*.html" -print0 | xargs -0 sed -i 's/\.html//g'
