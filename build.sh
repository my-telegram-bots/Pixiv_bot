yarn build
# vuepress will redirect automanually x to x.html
# to disable redirect will install another dependencies
find dist -type f -print0 | xargs -0 sed -i 's/"\.html"/"\.html1"/g'
find dist -type f -print0 | xargs -0 sed -i 's/\.html"/"/g'
find dist -type f -print0 | xargs -0 sed -i 's/"\.html1"/"\.html"/g'
