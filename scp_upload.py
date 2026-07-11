import pty
import os
import sys

def run_scp(host, user, password, local_path, remote_path):
    pid, fd = pty.fork()
    if pid == 0:
        os.execvp('scp', ['scp', '-o', 'StrictHostKeyChecking=no', local_path, f'{user}@{host}:{remote_path}'])
    else:
        output = b""
        password_sent = False
        while True:
            try:
                data = os.read(fd, 1024)
            except OSError:
                break
            if not data:
                break
            output += data
            if b'assword:' in data.lower() and not password_sent:
                os.write(fd, (password + '\n').encode())
                password_sent = True
        os.waitpid(pid, 0)
        print(output.decode(errors='ignore'))

if __name__ == "__main__":
    run_scp(sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5])
