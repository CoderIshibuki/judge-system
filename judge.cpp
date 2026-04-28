#include <iostream>
#include <fstream>
#include <string>
#include <chrono>
#include <cstdlib>

using namespace std;

// Hàm so sánh 2 file kết quả
bool compareFiles(const string& p1, const string& p2) {
    ifstream f1(p1), f2(p2);
    string w1, w2;
    while (f1 >> w1 && f2 >> w2) {
        if (w1 != w2) return false;
    }
    return !(f1 >> w1) && !(f2 >> w2);
}

int main() {
    // 1. Biên dịch code của thí sinh
    string compileCmd = "g++ submission.cpp -o file_chay.exe";
    int compileStatus = system(compileCmd.c_str());
    
    if (compileStatus != 0) {
        cout << "STATUS: CE\nTIME: 0" << endl; // Compile Error
        return 0;
    }

    // 2. Thực thi code thí sinh và đo thời gian
    string runCmd = "file_chay.exe < input.txt > output.txt";
    
    auto start = chrono::high_resolution_clock::now();
    int runStatus = system(runCmd.c_str());
    auto end = chrono::high_resolution_clock::now();
    
    double timeTaken = chrono::duration<double, milli>(end - start).count();

    // Giả lập Time Limit là 1000ms
    if (timeTaken > 1000.0) {
        cout << "STATUS: TLE\nTIME: " << timeTaken << endl; // Time Limit Exceeded
        return 0;
    }

    if (runStatus != 0) {
        cout << "STATUS: RE\nTIME: " << timeTaken << endl; // Runtime Error (VD: chia cho 0)
        return 0;
    }

    // 3. Đối chiếu kết quả với đáp án
    if (compareFiles("output.txt", "expected.txt")) {
        cout << "STATUS: AC\nTIME: " << timeTaken << endl; // Accepted
    } else {
        cout << "STATUS: WA\nTIME: " << timeTaken << endl; // Wrong Answer
    }

    return 0;
}