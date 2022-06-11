npx http-server . -p 8085 --cors 1>/dev/null 2>&1 &
HTTP_PID=$!

sleep 3

npx mochify --plugin esmify src/RWXLoader.test.js
TEST_CODE=$?

kill $HTTP_PID

exit $TEST_CODE
